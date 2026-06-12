/**
 * M1 bootstrap: a single generated chunk, culled-meshed and explorable with a
 * pointer-locked no-clip fly camera.
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
import { meshChunk, padLoneChunk, type MeshArrays } from './world/mesher';

const SEED = 'voxelheim-m1';
const MOUSE_SENSITIVITY = 0.002;

function meshArraysToGeometry(arrays: MeshArrays): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(arrays.positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(arrays.uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(arrays.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(arrays.indices, 1));
  const b = arrays.bounds;
  const center = new THREE.Vector3((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
  const radius = Math.hypot(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ) / 2;
  geometry.boundingSphere = new THREE.Sphere(center, radius);
  return geometry;
}

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

  const generator = createGenerator(SEED);
  const chunkData = generator.generateChunk(0, 0);
  const meshData = meshChunk(padLoneChunk(chunkData));
  if (meshData.opaque) {
    const mesh = new THREE.Mesh(meshArraysToGeometry(meshData.opaque), material);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    gr.scene.add(mesh);
    const tris = meshData.opaque.indices.length / 3;
    console.log(`[M1] one terrain chunk: ${tris} triangles, ${meshData.opaque.positions.length / 3} vertices`);
  }

  const input = new Input(gr.canvas);
  gr.canvas.addEventListener('click', () => input.requestLock());

  const player = new PlayerController();
  player.setPosition(8, generator.heightAt(8, 8) + 6, 24);

  const overlay = document.createElement('div');
  overlay.id = 'debug-overlay';
  app.appendChild(overlay);

  exposeDebug();
  const fps = new FpsCounter();
  const mouse = { dx: 0, dy: 0 };

  startLoop({
    update(dt) {
      if (input.locked) player.noclipUpdate(input, dt);
    },
    render() {
      input.takeMouseDelta(mouse);
      if (input.locked) player.look(mouse.dx, mouse.dy, MOUSE_SENSITIVITY);
      player.applyToCamera(gr.camera);
      gr.render();
      fps.tick();
      debugInfo.x = player.x;
      debugInfo.y = player.y;
      debugInfo.z = player.z;
      debugInfo.triangles = gr.info.render.triangles;
      debugInfo.drawCalls = gr.info.render.calls;
      overlay.textContent =
        `voxelgame M1 | fps ${debugInfo.fps}\n` +
        `pos ${player.x.toFixed(1)} ${player.y.toFixed(1)} ${player.z.toFixed(1)}\n` +
        `tris ${debugInfo.triangles} | calls ${debugInfo.drawCalls}\n` +
        `click to fly (WASD + Space/Shift)`;
    },
  });
}

boot();
