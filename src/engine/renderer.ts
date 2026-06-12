/**
 * Three.js scene/camera/renderer wrapper. Owns the canvas, resize handling
 * and clear color. No lights anywhere — all shading is baked vertex color.
 */
import * as THREE from 'three';

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'game-canvas';
    parent.appendChild(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 600);
    this.camera.rotation.order = 'YXZ';
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  setClearColor(color: THREE.Color): void {
    this.renderer.setClearColor(color);
  }

  /** Fog band tracks render distance: [RD*16*0.55, RD*16*0.95] (§4.10). */
  setViewDistance(rd: number): void {
    const range = rd * 16;
    if (!this.scene.fog) this.scene.fog = new THREE.Fog(new THREE.Color('#8ecae6'), 1, 2);
    this.scene.fog.near = range * 0.55;
    this.scene.fog.far = range * 0.95;
    this.camera.far = range * 1.2;
    this.camera.updateProjectionMatrix();
  }

  setFov(fov: number): void {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  get info(): THREE.WebGLInfo {
    return this.renderer.info;
  }
}
