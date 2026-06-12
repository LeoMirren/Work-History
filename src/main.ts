/**
 * M0 bootstrap: fixed-step loop driving a rotating cube textured from the
 * procedurally generated atlas. Replaced by the real game in later milestones.
 */
import './style.css';
import * as THREE from 'three';
import { createAtlasCanvas } from './engine/atlas';
import { GameRenderer } from './engine/renderer';
import { startLoop } from './engine/loop';
import { debugInfo, exposeDebug, FpsCounter } from './engine/debug';

function boot(): void {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app missing');

  const atlasCanvas = createAtlasCanvas('m0-demo-seed');
  const texture = new THREE.CanvasTexture(atlasCanvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;

  const gr = new GameRenderer(app);
  gr.setClearColor(new THREE.Color('#8ecae6'));
  gr.camera.position.set(0, 0, 2.2);

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ map: texture }),
  );
  gr.scene.add(cube);

  const overlay = document.createElement('div');
  overlay.id = 'debug-overlay';
  app.appendChild(overlay);

  exposeDebug();
  const fps = new FpsCounter();

  startLoop({
    update(dt) {
      cube.rotation.y += dt * 0.9;
      cube.rotation.x += dt * 0.35;
    },
    render() {
      fps.tick();
      overlay.textContent = `voxelgame M0 | fps ${debugInfo.fps}`;
      gr.render();
    },
  });
}

boot();
