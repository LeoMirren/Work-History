/**
 * M2 bootstrap: infinite streaming world explored with a no-clip fly camera.
 * Generation and meshing run in a worker pool; the main thread only uploads
 * geometry (throttled) and renders.
 */
import './style.css';
import * as THREE from 'three';
import { createAtlasCanvas } from './engine/atlas';
import { GameRenderer } from './engine/renderer';
import { startLoop } from './engine/loop';
import { debugInfo, exposeDebug, FpsCounter } from './engine/debug';
import { Input } from './engine/input';
import { PlayerController } from './player/controller';
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
  const spawnHeight = createGenerator(SEED).heightAt(0, 0);
  player.setPosition(0.5, spawnHeight + 4, 0.5);

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
      if (input.locked) player.noclipUpdate(input, dt);
    },
    render() {
      input.takeMouseDelta(mouse);
      if (input.locked) player.look(mouse.dx, mouse.dy, MOUSE_SENSITIVITY);
      player.applyToCamera(gr.camera);
      world.update(player.x, player.z);
      gr.render();
      fps.tick();
      world.stats(stats);
      debugInfo.x = player.x;
      debugInfo.y = player.y;
      debugInfo.z = player.z;
      debugInfo.chunkX = chunkCoord(Math.floor(player.x));
      debugInfo.chunkZ = chunkCoord(Math.floor(player.z));
      debugInfo.chunksLoaded = stats.chunksLoaded;
      debugInfo.chunksMeshed = stats.chunksMeshed;
      debugInfo.genQueued = stats.genQueued;
      debugInfo.meshQueued = stats.meshQueued;
      debugInfo.jobsInFlight = stats.jobsInFlight;
      debugInfo.uploadsQueued = stats.uploadsQueued;
      debugInfo.triangles = gr.info.render.triangles;
      debugInfo.drawCalls = gr.info.render.calls;
      debugInfo.geometries = gr.info.memory.geometries;
      overlay.textContent =
        `voxelgame M2 | fps ${debugInfo.fps}\n` +
        `pos ${player.x.toFixed(1)} ${player.y.toFixed(1)} ${player.z.toFixed(1)} | chunk ${debugInfo.chunkX},${debugInfo.chunkZ}\n` +
        `chunks ${stats.chunksLoaded} loaded / ${stats.chunksMeshed} meshed | queue g${stats.genQueued} m${stats.meshQueued} | jobs ${stats.jobsInFlight}\n` +
        `tris ${debugInfo.triangles} | calls ${debugInfo.drawCalls} | geoms ${debugInfo.geometries}\n` +
        `click to fly (WASD + Space/Shift)`;
    },
  });
}

boot();
