/**
 * Stretch §9: a single drifting translucent cloud plane at y=140. The blocky
 * cloud pattern is seeded procedural alpha on a repeating canvas texture; the
 * plane follows the player while texture offsets keep clouds world-anchored
 * (and slowly drifting east).
 */
import * as THREE from 'three';
import { rngFromSeed } from '../world/noise';

export const CLOUD_ALTITUDE = 140;
const TEX_SIZE = 256;
const CELL = 8; // blocky cloud cell size in texture pixels
const PLANE_SIZE = 2048; // meters
const REPEATS = 2; // texture tiles across the plane
const METERS_PER_TILE = PLANE_SIZE / REPEATS;
const DRIFT_SPEED = 1.5; // m/s

function paintClouds(canvas: HTMLCanvasElement, seed: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
  const rng = rngFromSeed(seed, 'clouds');
  const cells = TEX_SIZE / CELL; // 32
  // Wrapping value-noise lattice, thresholded into blocky cloud blobs.
  const lattice: number[] = [];
  for (let i = 0; i < cells * cells; i++) lattice.push(rng());
  const at = (x: number, y: number): number =>
    lattice[((y + cells) % cells) * cells + ((x + cells) % cells)] ?? 0;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      // Smooth each cell against its wrapped neighbors so blobs clump.
      const v =
        at(cx, cy) * 0.4 +
        (at(cx - 1, cy) + at(cx + 1, cy) + at(cx, cy - 1) + at(cx, cy + 1)) * 0.15;
      if (v > 0.62) ctx.fillRect(cx * CELL, cy * CELL, CELL, CELL);
    }
  }
}

export class Clouds {
  readonly material: THREE.MeshBasicMaterial;
  private readonly mesh: THREE.Mesh;
  private readonly texture: THREE.CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private driftX = 0;

  constructor(scene: THREE.Scene, seed: string) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = TEX_SIZE;
    this.canvas.height = TEX_SIZE;
    paintClouds(this.canvas, seed);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.wrapT = THREE.RepeatWrapping;
    this.texture.repeat.set(REPEATS, REPEATS);
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const geometry = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'clouds';
    this.mesh.rotation.set(-Math.PI / 2, 0, 0);
    this.mesh.renderOrder = 2; // after water
    this.mesh.frustumCulled = false; // always overhead, trivially cheap
    scene.add(this.mesh);
  }

  /** New seed → new cloud pattern (world switch). */
  reseed(seed: string): void {
    paintClouds(this.canvas, seed);
    this.texture.needsUpdate = true;
  }

  /** Follow the player; offset the texture so clouds stay world-anchored. */
  update(dt: number, playerX: number, playerZ: number): void {
    this.driftX += dt * DRIFT_SPEED;
    this.mesh.position.set(playerX, CLOUD_ALTITUDE, playerZ);
    this.texture.offset.set(
      (playerX - this.driftX) / METERS_PER_TILE,
      -playerZ / METERS_PER_TILE,
    );
  }
}
