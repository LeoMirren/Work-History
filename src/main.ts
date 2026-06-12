/**
 * Game bootstrap and orchestration: title screen → world session, pause menu,
 * settings, autosave and world persistence (§4.9, §4.11).
 */
import './style.css';
import * as THREE from 'three';
import { createAtlasCanvas } from './engine/atlas';
import { GameRenderer } from './engine/renderer';
import { createChunkMaterials } from './engine/materials';
import { TapAudio } from './engine/audio';
import { Clouds } from './engine/clouds';
import { brightnessAt, DayNight, NOON_TIME } from './engine/daynight';
import { startLoop } from './engine/loop';
import { debugInfo, exposeDebug, FpsCounter } from './engine/debug';
import { Input } from './engine/input';
import { PlayerController, type GameMode } from './player/controller';
import { Interaction, type HotbarState } from './player/interaction';
import { Inventory } from './player/inventory';
import { HurtIndicator } from './player/feedback';
import { MAX_HP, MAX_HUNGER, PLAYER_HALF_WIDTH } from './player/physics';
import { DamageOverlay } from './ui/damageOverlay';
import { Hud } from './ui/hud';
import { InfoPanel } from './ui/infoPanel';
import { InventoryScreen } from './ui/inventoryScreen';
import { ChestScreen } from './ui/chestScreen';
import { Guide } from './ui/guide';
import { ContainerStore } from './world/containers';
import { Block } from './world/blocks';
import { AnimalSystem } from './entities/animals';
import { HostileSystem } from './entities/hostiles';
import { Menus, DEFAULT_SETTINGS, type Settings } from './ui/menu';
import { createGenerator, findSafeSpawnY, type Dimension } from './world/worldgen';
import { World, type ChunkPersistence } from './world/world';
import { WorkerPool } from './workers/pool';
import { chunkCoord, CHUNK_VOLUME } from './world/chunk';
import { decodeRLE, encodeRLE } from './persist/rle';
import { chunkStoreKey, IDBStorage, MemoryStorage, type StorageBackend, type WorldMeta } from './persist/store';
import type { WorldStats } from './world/world';

const BASE_SENSITIVITY = 0.002;
const AUTOSAVE_INTERVAL_MS = 10_000;
const UNDERWORLD_SKY = new THREE.Color(0x1a0d10);

interface Session {
  seed: string;
  mode: GameMode;
  dimension: Dimension;
  world: World;
  texture: THREE.Texture;
  atlasCanvas: HTMLCanvasElement;
  persistedKeys: Set<string>;
}

/** Chunk store key namespaced by dimension so realms never collide. */
function dimChunkKey(dim: Dimension, cx: number, cz: number): string {
  return `${dim === 'underworld' ? 'u' : 'o'}:${chunkStoreKey(cx, cz)}`;
}

async function boot(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app missing');

  let storage: StorageBackend;
  try {
    storage = await IDBStorage.open();
  } catch (err) {
    console.error('IndexedDB unavailable, falling back to in-memory storage', err);
    storage = new MemoryStorage();
  }
  const savedMeta = await storage.getMeta();

  const gr = new GameRenderer(app);
  const dayNight = new DayNight();
  const input = new Input(gr.canvas);
  gr.canvas.addEventListener('click', () => {
    if (session && !menus.pauseVisible) input.requestLock();
  });

  // The three shared chunk materials — every chunk mesh reuses these; only
  // their texture/uniforms change at runtime.
  const materials = createChunkMaterials();
  const materialList = [materials.opaque, materials.cutout, materials.water];
  const clouds = new Clouds(gr.scene, 'voxelheim');

  const pool = new WorkerPool(
    () => new Worker(new URL('./workers/worker.ts', import.meta.url), { type: 'module' }),
    Math.max(2, (navigator.hardwareConcurrency || 4) - 1),
  );

  const player = new PlayerController();
  const interaction = new Interaction(gr.scene);
  const audio = new TapAudio();
  interaction.onEdit = (kind, blockId) => audio.play(kind, blockId);
  const inventory = new Inventory();
  const inventoryScreen = new InventoryScreen(app);
  const chestScreen = new ChestScreen(app);
  const containers = new ContainerStore();
  let chestOpen = false;
  const guide = new Guide(app);
  let guideOpen = false;
  const infoPanel = new InfoPanel(app);
  const damageOverlay = new DamageOverlay(app);
  const hurt = new HurtIndicator();
  let prevHp = MAX_HP;

  /** A furnace block within a small box around the player (smelting station). */
  function furnaceNearby(world: World): boolean {
    const fx = Math.floor(player.body.x);
    const fy = Math.floor(player.body.y);
    const fz = Math.floor(player.body.z);
    for (let dy = -1; dy <= 2; dy++) {
      for (let dz = -4; dz <= 4; dz++) {
        for (let dx = -4; dx <= 4; dx++) {
          if (world.getBlock(fx + dx, fy + dy, fz + dz) === Block.furnace) return true;
        }
      }
    }
    return false;
  }
  const animals = new AnimalSystem(gr.scene);
  interaction.animals = animals;
  const hostiles = new HostileSystem(gr.scene);
  interaction.hostiles = hostiles;
  interaction.onOpenContainer = (x, y, z) => {
    if (!session) return false;
    chestScreen.open(containers.get(x, y, z), inventory, session.atlasCanvas);
    chestOpen = true;
    document.exitPointerLock();
    return true;
  };
  interaction.onBlockChanged = (kind, id, x, y, z) => {
    containers.onBlockChanged(kind, id, x, y, z, (itemId, count) => inventory.add(itemId, count));
  };
  interaction.onActivateRift = (_x, _y, _z) => {
    const target: Dimension = session?.dimension === 'underworld' ? 'overworld' : 'underworld';
    void enterDimension(target);
    return true;
  };
  let inventoryOpen = false;
  let hud: Hud | null = null;
  let session: Session | null = null;
  let settings: Settings = { ...DEFAULT_SETTINGS };
  const hotbarState: HotbarState = { creativeBlock: 0, inventory: null, slot: 0 };

  function applySettings(next: Settings): void {
    settings = { ...next };
    gr.setViewDistance(settings.renderDistance);
    const range = settings.renderDistance * 16;
    for (const m of materialList) {
      m.uniforms.fogNear.value = range * 0.55;
      m.uniforms.fogFar.value = range * 0.95;
    }
    // FOV itself is driven by the render loop (sprint kick smoothing).
    session?.world.setRenderDistance(settings.renderDistance);
  }

  function buildMeta(): WorldMeta {
    return {
      version: 1,
      seed: session?.seed ?? '',
      mode: session?.mode ?? 'creative',
      player: {
        x: player.body.x,
        y: player.body.y,
        z: player.body.z,
        yaw: player.yaw,
        pitch: player.pitch,
        flying: player.flying,
        hp: player.hp,
        hunger: player.hunger,
        inventory: inventory.serialize(),
      },
      settings: { ...settings },
      timeOfDay: dayNight.time,
      dimension: session?.dimension ?? 'overworld',
      containers: containers.serialize(),
    };
  }

  function saveWorld(): Promise<unknown> {
    const s = session;
    if (!s) return Promise.resolve();
    const puts: Array<Promise<void>> = [];
    s.world.flushDirty((cx, cz, data) => {
      const key = dimChunkKey(s.dimension, cx, cz);
      s.persistedKeys.add(key);
      puts.push(storage.putChunk(key, encodeRLE(data)));
    });
    puts.push(storage.putMeta(buildMeta()));
    return Promise.all(puts).catch((err) => console.error('save failed', err));
  }

  function startSession(
    seed: string,
    mode: GameMode,
    resume: WorldMeta | null,
    persistedKeys: Set<string>,
    dimension: Dimension = 'overworld',
    spawnOverride?: { x: number; y: number; z: number },
    keepPlayer = false,
  ): void {
    if (session) {
      session.world.dispose();
      session.texture.dispose();
    }

    const atlasCanvas = createAtlasCanvas(seed);
    const texture = new THREE.CanvasTexture(atlasCanvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    for (const m of materialList) {
      m.uniforms.map.value = texture;
    }
    if (!hud) hud = new Hud(app as HTMLElement, atlasCanvas);
    else hud.redrawIcons(atlasCanvas);
    clouds.reseed(seed);

    const persistence: ChunkPersistence = {
      has: (cx, cz) => persistedKeys.has(dimChunkKey(dimension, cx, cz)),
      load: async (cx, cz) => {
        const key = dimChunkKey(dimension, cx, cz);
        try {
          const encoded = await storage.getChunk(key);
          if (!encoded) {
            persistedKeys.delete(key);
            return null;
          }
          return decodeRLE(encoded, CHUNK_VOLUME);
        } catch (err) {
          console.error(`corrupt chunk ${key}, regenerating`, err);
          persistedKeys.delete(key);
          return null;
        }
      },
    };

    const world = new World({
      seed,
      scene: gr.scene,
      materials,
      pool,
      renderDistance: settings.renderDistance,
      persistence,
      dimension,
    });

    const spawnY = spawnOverride ? spawnOverride.y : createGenerator(seed, dimension).heightAt(0, 0) + 2;
    const spawnX = spawnOverride ? spawnOverride.x : 0.5;
    const spawnZ = spawnOverride ? spawnOverride.z : 0.5;
    player.setSpawn(spawnX, spawnY, spawnZ);
    if (keepPlayer) {
      // Dimension switch: preserve inventory/hp/hunger, just relocate.
      player.teleport(spawnX, spawnY, spawnZ);
    } else if (resume) {
      player.teleport(resume.player.x, resume.player.y, resume.player.z);
      player.yaw = resume.player.yaw;
      player.pitch = resume.player.pitch;
      player.flying = resume.player.flying === true;
      const hp = resume.player.hp;
      player.hp = Number.isFinite(hp) && hp >= 1 && hp <= MAX_HP ? Math.floor(hp) : MAX_HP;
      const hunger = resume.player.hunger;
      player.hunger = Number.isFinite(hunger) && hunger >= 0 && hunger <= MAX_HUNGER ? Math.floor(hunger) : MAX_HUNGER;
      inventory.load(resume.player.inventory);
      dayNight.time = resume.timeOfDay;
    } else {
      player.teleport(0.5, spawnY, 0.5);
      player.yaw = 0;
      player.pitch = 0;
      player.flying = false;
      player.hp = MAX_HP;
      player.hunger = MAX_HUNGER;
      inventory.load(undefined);
      dayNight.time = NOON_TIME;
    }
    player.setMode(mode);
    interaction.mode = mode;
    const entityWorld = { isSolid: world.isSolid, getBlock: world.blockAt };
    animals.setWorld(entityWorld);
    animals.setBiomeFn(dimension === 'overworld' ? createGenerator(seed, dimension).biomeAt : null);
    hostiles.setWorld(mode === 'survival' ? entityWorld : null);
    infoPanel.show();
    hud.setSurvivalVisible(mode === 'survival');
    hud.bindInventory(mode === 'survival' ? inventory : null, atlasCanvas);
    if (inventoryOpen) {
      inventoryScreen.close();
      inventoryOpen = false;
    }
    if (guideOpen) {
      guide.close();
      guideOpen = false;
    }
    if (chestOpen) {
      chestScreen.close();
      chestOpen = false;
    }
    containers.load(resume?.containers);

    session = { seed, mode, dimension, world, texture, atlasCanvas, persistedKeys };
    menus.setPauseSeed(seed);
  }

  /** Travel between dimensions via a riftframe: save, swap worlds, relocate. */
  async function enterDimension(target: Dimension): Promise<void> {
    const s = session;
    if (!s || s.dimension === target) return;
    await saveWorld();
    const prefix = target === 'underworld' ? 'u:' : 'o:';
    const keys = new Set((await storage.listChunkKeys()).filter((k) => k.startsWith(prefix)));
    const wx = Math.floor(player.body.x);
    const wz = Math.floor(player.body.z);
    const safeY = findSafeSpawnY(s.seed, target, wx, wz);
    startSession(s.seed, s.mode, null, keys, target, { x: wx + 0.5, y: safeY, z: wz + 0.5 }, true);
    input.requestLock();
  }

  const savedMode: GameMode = savedMeta?.mode === 'survival' ? 'survival' : 'creative';
  const menus = new Menus(app, {
    onPlay: (seed, survival) => {
      void (async () => {
        if (savedMeta && savedMeta.seed === seed) {
          applySettings(savedMeta.settings);
          menus.applySettings(savedMeta.settings);
          const dim: Dimension = savedMeta.dimension === 'underworld' ? 'underworld' : 'overworld';
          const prefix = dim === 'underworld' ? 'u:' : 'o:';
          const keys = new Set((await storage.listChunkKeys()).filter((k) => k.startsWith(prefix)));
          startSession(seed, savedMode, savedMeta, keys, dim);
        } else {
          await storage.clearAll();
          startSession(seed, survival ? 'survival' : 'creative', null, new Set());
        }
        menus.hideTitle();
        input.requestLock();
      })();
    },
    onResume: () => input.requestLock(),
    onSave: () => void saveWorld(),
    onNewWorld: (seed) => {
      void (async () => {
        await storage.clearAll();
        // New worlds from the pause menu keep the current session's mode.
        startSession(seed, session?.mode ?? 'creative', null, new Set());
        menus.hidePause();
        input.requestLock();
      })();
    },
    onSettingsChange: (next) => {
      applySettings(next);
      void saveWorld();
    },
  });
  if (savedMeta) {
    menus.setTitleSeed(savedMeta.seed);
    menus.setTitleSurvival(savedMode === 'survival');
    menus.applySettings(savedMeta.settings);
    applySettings(savedMeta.settings);
  } else {
    applySettings(settings);
  }

  input.onLockChange = (locked) => {
    if (locked) {
      menus.hidePause();
    } else if (session && !inventoryOpen && !guideOpen && !chestOpen) {
      menus.showPause();
    }
  };

  setInterval(() => void saveWorld(), AUTOSAVE_INTERVAL_MS);
  window.addEventListener('beforeunload', () => void saveWorld());

  if (import.meta.env.DEV) {
    // §5 M5 acceptance: no per-chunk materials may ever exist.
    setInterval(() => {
      const seen = new Set<THREE.Material>();
      gr.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.name !== 'clouds' && obj.name !== 'entity') seen.add(obj.material);
      });
      for (const m of seen) {
        console.assert(materialList.some((mat) => mat === m), 'non-shared chunk material detected');
      }
      console.assert(seen.size <= 3, `expected <=3 shared materials, saw ${seen.size}`);
    }, 5000);
  }

  /** Physics may run only when the chunks under the player AABB have data. */
  function physicsReady(world: World): boolean {
    const { x, z } = player.body;
    return (
      world.hasDataAt(Math.floor(x - PLAYER_HALF_WIDTH), Math.floor(z - PLAYER_HALF_WIDTH)) &&
      world.hasDataAt(Math.floor(x + PLAYER_HALF_WIDTH), Math.floor(z - PLAYER_HALF_WIDTH)) &&
      world.hasDataAt(Math.floor(x - PLAYER_HALF_WIDTH), Math.floor(z + PLAYER_HALF_WIDTH)) &&
      world.hasDataAt(Math.floor(x + PLAYER_HALF_WIDTH), Math.floor(z + PLAYER_HALF_WIDTH))
    );
  }

  exposeDebug();
  const fps = new FpsCounter();
  const mouse = { dx: 0, dy: 0 };
  const stats: WorldStats = {
    chunksLoaded: 0,
    chunksMeshed: 0,
    genQueued: 0,
    meshQueued: 0,
    jobsInFlight: 0,
    uploadsQueued: 0,
  };
  // Debug text/stat refresh is throttled: string building is the one
  // per-frame heap allocation the render loop would otherwise make (§7).
  const DEBUG_REFRESH_MS = 250;
  let nextDebugRefresh = 0;
  // Sprint FOV kick: smooth toward base FOV x1.08 while sprinting.
  const SPRINT_FOV_FACTOR = 1.08;
  let currentFov = settings.fov;
  let appliedFov = 0;

  startLoop({
    update(dt) {
      if (!session || !input.locked) return;
      dayNight.advance(dt);
      if (physicsReady(session.world)) player.fixedUpdate(input, session.world, dt);
      animals.fixedUpdate(dt, player.body.x, player.body.y, player.body.z);
      if (session.mode === 'survival') {
        // The underworld is always dark and dangerous; the sun never reaches it.
        const threatBrightness = session.dimension === 'underworld' ? 0 : brightnessAt(dayNight.time);
        hostiles.fixedUpdate(
          dt,
          player.body.x,
          player.body.y,
          player.body.z,
          threatBrightness,
          (dmg) => player.hurt(dmg),
        );
      }
    },
    render(alpha, frameDt) {
      if (session?.dimension === 'underworld') {
        gr.setClearColor(UNDERWORLD_SKY);
        for (const m of materialList) {
          m.uniforms.uBrightness.value = 0.05; // no sun down here; ember/lantern light carries
          m.uniforms.fogColor.value.copy(UNDERWORLD_SKY);
        }
      } else {
        dayNight.apply(gr, materials, clouds.material);
      }
      clouds.update(frameDt, player.body.x, player.body.z);
      // Damage feedback: flash on hp loss, steady vignette at low health.
      if (session?.mode === 'survival') {
        if (player.hp < prevHp) hurt.hit(prevHp - player.hp);
        prevHp = player.hp;
        hurt.update(frameDt);
        damageOverlay.setIntensity(hurt.intensity(player.hp, MAX_HP));
      } else {
        prevHp = player.hp;
        damageOverlay.setIntensity(0);
      }
      const targetFov = settings.fov * (player.sprinting ? SPRINT_FOV_FACTOR : 1);
      currentFov += (targetFov - currentFov) * Math.min(1, frameDt * 12);
      if (Math.abs(currentFov - appliedFov) > 0.05) {
        appliedFov = currentFov;
        gr.setFov(currentFov);
      }
      input.takeMouseDelta(mouse);
      // Chest screen (right-click a chest) — close with E/Esc.
      if (session && chestOpen) {
        if (input.takePressed('KeyE') || input.takePressed('Escape')) {
          chestScreen.close();
          chestOpen = false;
          input.requestLock();
        } else {
          chestScreen.render();
        }
      }
      // Inventory screen (E) swaps pointer lock for the cursor.
      if (session && hud && session.mode === 'survival' && !chestOpen) {
        if (inventoryOpen) {
          if (input.takePressed('KeyE') || input.takePressed('Escape')) {
            inventoryScreen.close();
            inventoryOpen = false;
            input.requestLock();
          } else {
            inventoryScreen.refreshIfStale();
          }
        } else if (input.locked && input.takePressed('KeyE')) {
          inventoryOpen = true;
          inventoryScreen.open(inventory, session.atlasCanvas, furnaceNearby(session.world));
          document.exitPointerLock();
        }
      }
      // Guide book (G) — available in any mode; also swaps pointer lock.
      if (session && !chestOpen) {
        if (guideOpen) {
          if (input.takePressed('KeyG') || input.takePressed('Escape')) {
            guide.close();
            guideOpen = false;
            input.requestLock();
          }
        } else if (input.locked && !inventoryOpen && input.takePressed('KeyG')) {
          guideOpen = true;
          guide.open(session.atlasCanvas);
          document.exitPointerLock();
        }
      }
      if (session && input.locked && hud) {
        player.look(mouse.dx, mouse.dy, BASE_SENSITIVITY * settings.mouseSensitivity);
        for (let d = 1; d <= 9; d++) {
          if (input.takePressed(`Digit${d}`)) hud.selectSlot(d - 1);
        }
        const wheel = input.takeWheel();
        if (wheel !== 0) hud.stepSlot(wheel > 0 ? 1 : -1);
        if (input.takePressed('F3')) hud.toggleDebug();
        if (input.takePressed('Tab')) infoPanel.toggle();
        hotbarState.creativeBlock = hud.selectedBlock;
        hotbarState.inventory = session.mode === 'survival' ? inventory : null;
        hotbarState.slot = hud.selectedSlot;
        interaction.update(input, session.world, player, frameDt, hotbarState);
        if (session.mode === 'survival') {
          hud.setHealth(player.hp);
          hud.setHunger(player.hunger);
          hud.setBreakProgress(interaction.breakProgress);
          hud.updateHotbar();
        }
      }
      player.applyToCamera(gr.camera, alpha);
      session?.world.update(player.body.x, player.body.z);
      gr.render();
      fps.tick();
      if (!session || !hud) return;
      const now = performance.now();
      if (now < nextDebugRefresh) return;
      nextDebugRefresh = now + DEBUG_REFRESH_MS;
      session.world.stats(stats);
      const b = player.body;
      debugInfo.x = b.x;
      debugInfo.y = b.y;
      debugInfo.z = b.z;
      debugInfo.facing = facingLabel(player.yaw);
      debugInfo.chunkX = chunkCoord(Math.floor(b.x));
      debugInfo.chunkZ = chunkCoord(Math.floor(b.z));
      debugInfo.chunksLoaded = stats.chunksLoaded;
      debugInfo.chunksMeshed = stats.chunksMeshed;
      debugInfo.genQueued = stats.genQueued;
      debugInfo.meshQueued = stats.meshQueued;
      debugInfo.jobsInFlight = stats.jobsInFlight;
      debugInfo.uploadsQueued = stats.uploadsQueued;
      debugInfo.triangles = gr.info.render.triangles;
      debugInfo.drawCalls = gr.info.render.calls;
      debugInfo.geometries = gr.info.memory.geometries;
      const mode = player.flying ? 'fly' : player.inWater ? 'swim' : b.onGround ? 'walk' : 'air';
      const dayFrac = (((dayNight.time % 480) + 480) % 480) / 480;
      const clockH = Math.floor((dayFrac * 24 + 6) % 24);
      const clockM = Math.floor(((dayFrac * 24 + 6) % 1) * 60);
      infoPanel.setStatus({
        hp: player.hp,
        maxHp: MAX_HP,
        hunger: player.hunger,
        mode: session.mode === 'survival' ? `survival (${mode})` : `creative (${mode})`,
        position: `${b.x.toFixed(0)}, ${b.y.toFixed(0)}, ${b.z.toFixed(0)}`,
        time: `${clockH}:${String(clockM).padStart(2, '0')}`,
        animals: animals.count,
        threats: hostiles.count,
        fps: debugInfo.fps,
      });
      hud.setDebugText(
        `Voxelheim | fps ${debugInfo.fps}\n` +
          `pos ${b.x.toFixed(2)} ${b.y.toFixed(2)} ${b.z.toFixed(2)} | facing ${debugInfo.facing} | chunk ${debugInfo.chunkX},${debugInfo.chunkZ} | ${mode}\n` +
          `chunks ${stats.chunksLoaded} loaded / ${stats.chunksMeshed} meshed | queue g${stats.genQueued} m${stats.meshQueued} | jobs ${stats.jobsInFlight}\n` +
          `tris ${debugInfo.triangles} | calls ${debugInfo.drawCalls} | geoms ${debugInfo.geometries}`,
      );
    },
  });
}

function facingLabel(yaw: number): string {
  const deg = ((((-yaw * 180) / Math.PI) % 360) + 360) % 360;
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return `${names[Math.round(deg / 45) % 8]} ${deg.toFixed(0)}°`;
}

void boot();
