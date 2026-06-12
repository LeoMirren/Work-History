/**
 * M3 bootstrap: streaming world with real player physics — gravity, jumping,
 * sprint/sneak, fly toggle (F) and swimming. Physics holds until the spawn
 * area's chunk data is in.
 */
import './style.css';
import * as THREE from 'three';
import { createAtlasCanvas } from './engine/atlas';
import { GameRenderer } from './engine/renderer';
import { startLoop } from './engine/loop';
import { debugInfo, exposeDebug, FpsCounter } from './engine/debug';
import { Input } from './engine/input';
import { PlayerController } from './player/controller';
import { PLAYER_HALF_WIDTH } from './player/physics';
import { createGenerator } from './world/worldgen';
import { World, type WorldStats } from './world/world';
import { WorkerPool } from './workers/pool';
import { chunkCoord } from './world/chunk';

const SEED = 'voxelheim';
const RENDER_DISTANCE = 8;
const MOUSE_SENSITIVITY = 0.002;

function boot(): void {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app missing');

  const texture = new THREE.CanvasTexture(createAtlasCanvas(SEED));
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, vertexColors: true });

  const gr = new GameRenderer(app);
  gr.setClearColor(new THREE.Color('#8ecae6'));
  gr.setViewDistance(RENDER_DISTANCE);

  const pool = new WorkerPool(
    () => new Worker(new URL('./workers/worker.ts', import.meta.url), { type: 'module' }),
    Math.max(2, (navigator.hardwareConcurrency || 4) - 1),
  );

  const world = new World({
    seed: SEED,
    scene: gr.scene,
    material,
    pool,
    renderDistance: RENDER_DISTANCE,
  });

  const input = new Input(gr.canvas);
  gr.canvas.addEventListener('click', () => input.requestLock());

  const player = new PlayerController();
  const spawnY = createGenerator(SEED).heightAt(0, 0) + 2;
  player.setSpawn(0.5, spawnY, 0.5);
  player.teleport(0.5, spawnY, 0.5);

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

  const overlay = document.createElement('div');
  overlay.id = 'debug-overlay';
  app.appendChild(overlay);

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
      if (input.locked && physicsReady()) player.fixedUpdate(input, world, dt);
    },
    render(alpha) {
      input.takeMouseDelta(mouse);
      if (input.locked) player.look(mouse.dx, mouse.dy, MOUSE_SENSITIVITY);
      player.applyToCamera(gr.camera, alpha);
      world.update(player.body.x, player.body.z);
      gr.render();
      fps.tick();
      world.stats(stats);
      const b = player.body;
      debugInfo.x = b.x;
      debugInfo.y = b.y;
      debugInfo.z = b.z;
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
      overlay.textContent =
        `voxelgame M3 | fps ${debugInfo.fps}\n` +
        `pos ${b.x.toFixed(2)} ${b.y.toFixed(2)} ${b.z.toFixed(2)} | chunk ${debugInfo.chunkX},${debugInfo.chunkZ} | ${mode}\n` +
        `chunks ${stats.chunksLoaded} loaded / ${stats.chunksMeshed} meshed | queue g${stats.genQueued} m${stats.meshQueued} | jobs ${stats.jobsInFlight}\n` +
        `tris ${debugInfo.triangles} | calls ${debugInfo.drawCalls} | geoms ${debugInfo.geometries}\n` +
        `WASD move · Space jump · Ctrl/2xW sprint · Shift sneak · F fly`;
    },
  });
}

boot();
