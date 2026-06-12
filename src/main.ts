/**
 * M4 bootstrap: the interactive sandbox — streaming world, physics, block
 * breaking/placing with outline and hotbar.
 */
import './style.css';
import * as THREE from 'three';
import { createAtlasCanvas } from './engine/atlas';
import { GameRenderer } from './engine/renderer';
import { DayNight } from './engine/daynight';
import { startLoop } from './engine/loop';
import { debugInfo, exposeDebug, FpsCounter } from './engine/debug';
import { Input } from './engine/input';
import { PlayerController } from './player/controller';
import { Interaction } from './player/interaction';
import { PLAYER_HALF_WIDTH } from './player/physics';
import { Hud } from './ui/hud';
import { createGenerator } from './world/worldgen';
import { World, type WorldStats } from './world/world';
import { WorkerPool } from './workers/pool';
import { chunkCoord } from './world/chunk';

const SEED = 'voxelheim';
const RENDER_DISTANCE = 8;
const MOUSE_SENSITIVITY = 0.002;

function facingLabel(yaw: number): string {
  const deg = ((((-yaw * 180) / Math.PI) % 360) + 360) % 360;
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return `${names[Math.round(deg / 45) % 8]} ${deg.toFixed(0)}°`;
}

function boot(): void {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app missing');

  const atlasCanvas = createAtlasCanvas(SEED);
  const texture = new THREE.CanvasTexture(atlasCanvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  // The three shared materials (§4.3) — every chunk mesh reuses these.
  const materials = {
    opaque: new THREE.MeshBasicMaterial({ map: texture, vertexColors: true }),
    cutout: new THREE.MeshBasicMaterial({ map: texture, vertexColors: true, alphaTest: 0.5 }),
    water: new THREE.MeshBasicMaterial({
      map: texture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  };
  const materialList = [materials.opaque, materials.cutout, materials.water];

  const gr = new GameRenderer(app);
  gr.setViewDistance(RENDER_DISTANCE);
  const dayNight = new DayNight();

  const pool = new WorkerPool(
    () => new Worker(new URL('./workers/worker.ts', import.meta.url), { type: 'module' }),
    Math.max(2, (navigator.hardwareConcurrency || 4) - 1),
  );

  const world = new World({
    seed: SEED,
    scene: gr.scene,
    materials,
    pool,
    renderDistance: RENDER_DISTANCE,
  });

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

  const input = new Input(gr.canvas);
  gr.canvas.addEventListener('click', () => input.requestLock());

  const player = new PlayerController();
  const spawnY = createGenerator(SEED).heightAt(0, 0) + 2;
  player.setSpawn(0.5, spawnY, 0.5);
  player.teleport(0.5, spawnY, 0.5);

  const hud = new Hud(app, atlasCanvas);
  const interaction = new Interaction(gr.scene);

  /** Physics may run only when the chunks under the player AABB have data. */
  function physicsReady(): boolean {
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

  startLoop({
    update(dt) {
      dayNight.advance(dt);
      if (input.locked && physicsReady()) player.fixedUpdate(input, world, dt);
    },
    render(alpha) {
      dayNight.apply(gr, materialList);
      input.takeMouseDelta(mouse);
      if (input.locked) {
        player.look(mouse.dx, mouse.dy, MOUSE_SENSITIVITY);
        // Hotbar: digits 1-9 and wheel.
        for (let d = 1; d <= 9; d++) {
          if (input.takePressed(`Digit${d}`)) hud.selectSlot(d - 1);
        }
        const wheel = input.takeWheel();
        if (wheel !== 0) hud.stepSlot(wheel > 0 ? 1 : -1);
        if (input.takePressed('F3')) hud.toggleDebug();
        interaction.update(input, world, player, hud.selectedBlock);
      }
      player.applyToCamera(gr.camera, alpha);
      world.update(player.body.x, player.body.z);
      gr.render();
      fps.tick();
      world.stats(stats);
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
        `voxelgame M4 | fps ${debugInfo.fps}\n` +
          `pos ${b.x.toFixed(2)} ${b.y.toFixed(2)} ${b.z.toFixed(2)} | facing ${debugInfo.facing} | chunk ${debugInfo.chunkX},${debugInfo.chunkZ} | ${mode}\n` +
          `chunks ${stats.chunksLoaded} loaded / ${stats.chunksMeshed} meshed | queue g${stats.genQueued} m${stats.meshQueued} | jobs ${stats.jobsInFlight}\n` +
          `tris ${debugInfo.triangles} | calls ${debugInfo.drawCalls} | geoms ${debugInfo.geometries}`,
      );
    },
  });
}

boot();
