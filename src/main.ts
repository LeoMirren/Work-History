/**
 * Game bootstrap and orchestration: title screen → world session, pause menu,
 * settings, autosave and world persistence (§4.9, §4.11).
 */
import './style.css';
import * as THREE from 'three';
import { createAtlasCanvas } from './engine/atlas';
import { GameRenderer } from './engine/renderer';
import { DayNight, NOON_TIME } from './engine/daynight';
import { startLoop } from './engine/loop';
import { debugInfo, exposeDebug, FpsCounter } from './engine/debug';
import { Input } from './engine/input';
import { PlayerController } from './player/controller';
import { Interaction } from './player/interaction';
import { PLAYER_HALF_WIDTH } from './player/physics';
import { Hud } from './ui/hud';
import { Menus, DEFAULT_SETTINGS, type Settings } from './ui/menu';
import { createGenerator } from './world/worldgen';
import { World, type ChunkPersistence } from './world/world';
import { WorkerPool } from './workers/pool';
import { chunkCoord, CHUNK_VOLUME } from './world/chunk';
import { decodeRLE, encodeRLE } from './persist/rle';
import { chunkStoreKey, IDBStorage, MemoryStorage, type StorageBackend, type WorldMeta } from './persist/store';
import type { WorldStats } from './world/world';

const BASE_SENSITIVITY = 0.002;
const AUTOSAVE_INTERVAL_MS = 10_000;

interface Session {
  seed: string;
  world: World;
  texture: THREE.Texture;
  persistedKeys: Set<string>;
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

  // The three shared materials (§4.3) — every chunk mesh reuses these; only
  // their map swaps on world change.
  const materials = {
    opaque: new THREE.MeshBasicMaterial({ vertexColors: true }),
    cutout: new THREE.MeshBasicMaterial({ vertexColors: true, alphaTest: 0.5 }),
    water: new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  };
  const materialList = [materials.opaque, materials.cutout, materials.water];

  const pool = new WorkerPool(
    () => new Worker(new URL('./workers/worker.ts', import.meta.url), { type: 'module' }),
    Math.max(2, (navigator.hardwareConcurrency || 4) - 1),
  );

  const player = new PlayerController();
  const interaction = new Interaction(gr.scene);
  let hud: Hud | null = null;
  let session: Session | null = null;
  let settings: Settings = { ...DEFAULT_SETTINGS };

  function applySettings(next: Settings): void {
    settings = { ...next };
    gr.setViewDistance(settings.renderDistance);
    gr.setFov(settings.fov);
    session?.world.setRenderDistance(settings.renderDistance);
  }

  function buildMeta(): WorldMeta {
    return {
      version: 1,
      seed: session?.seed ?? '',
      player: {
        x: player.body.x,
        y: player.body.y,
        z: player.body.z,
        yaw: player.yaw,
        pitch: player.pitch,
        flying: player.flying,
      },
      settings: { ...settings },
      timeOfDay: dayNight.time,
    };
  }

  function saveWorld(): Promise<unknown> {
    const s = session;
    if (!s) return Promise.resolve();
    const puts: Array<Promise<void>> = [];
    s.world.flushDirty((cx, cz, data) => {
      const key = chunkStoreKey(cx, cz);
      s.persistedKeys.add(key);
      puts.push(storage.putChunk(key, encodeRLE(data)));
    });
    puts.push(storage.putMeta(buildMeta()));
    return Promise.all(puts).catch((err) => console.error('save failed', err));
  }

  function startSession(seed: string, resume: WorldMeta | null, persistedKeys: Set<string>): void {
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
      m.map = texture;
      m.needsUpdate = true;
    }
    if (!hud) hud = new Hud(app as HTMLElement, atlasCanvas);
    else hud.redrawIcons(atlasCanvas);

    const persistence: ChunkPersistence = {
      has: (cx, cz) => persistedKeys.has(chunkStoreKey(cx, cz)),
      load: async (cx, cz) => {
        const key = chunkStoreKey(cx, cz);
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
    });

    const spawnY = createGenerator(seed).heightAt(0, 0) + 2;
    player.setSpawn(0.5, spawnY, 0.5);
    if (resume) {
      player.teleport(resume.player.x, resume.player.y, resume.player.z);
      player.yaw = resume.player.yaw;
      player.pitch = resume.player.pitch;
      player.flying = resume.player.flying;
      dayNight.time = resume.timeOfDay;
    } else {
      player.teleport(0.5, spawnY, 0.5);
      player.yaw = 0;
      player.pitch = 0;
      player.flying = false;
      dayNight.time = NOON_TIME;
    }

    session = { seed, world, texture, persistedKeys };
    menus.setPauseSeed(seed);
  }

  const menus = new Menus(app, {
    onPlay: (seed) => {
      void (async () => {
        if (savedMeta && savedMeta.seed === seed) {
          applySettings(savedMeta.settings);
          menus.applySettings(savedMeta.settings);
          startSession(seed, savedMeta, new Set(await storage.listChunkKeys()));
        } else {
          await storage.clearAll();
          startSession(seed, null, new Set());
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
        startSession(seed, null, new Set());
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
    menus.applySettings(savedMeta.settings);
    applySettings(savedMeta.settings);
  } else {
    applySettings(settings);
  }

  input.onLockChange = (locked) => {
    if (locked) {
      menus.hidePause();
    } else if (session) {
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
        if (obj instanceof THREE.Mesh) seen.add(obj.material);
      });
      for (const m of seen) {
        console.assert(
          materialList.includes(m as THREE.MeshBasicMaterial),
          'non-shared chunk material detected',
        );
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

  startLoop({
    update(dt) {
      if (!session || !input.locked) return;
      dayNight.advance(dt);
      if (physicsReady(session.world)) player.fixedUpdate(input, session.world, dt);
    },
    render(alpha) {
      dayNight.apply(gr, materialList);
      input.takeMouseDelta(mouse);
      if (session && input.locked && hud) {
        player.look(mouse.dx, mouse.dy, BASE_SENSITIVITY * settings.mouseSensitivity);
        for (let d = 1; d <= 9; d++) {
          if (input.takePressed(`Digit${d}`)) hud.selectSlot(d - 1);
        }
        const wheel = input.takeWheel();
        if (wheel !== 0) hud.stepSlot(wheel > 0 ? 1 : -1);
        if (input.takePressed('F3')) hud.toggleDebug();
        interaction.update(input, session.world, player, hud.selectedBlock);
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
