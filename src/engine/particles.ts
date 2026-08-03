/**
 * Block-break particles: a fixed pool of points burst in the broken block's
 * colour, falling under light gravity for a moment. One Points object, one
 * draw call; dead slots park far below the world.
 */
import * as THREE from 'three';

const MAX = 96;
const PER_BURST = 12;
const LIFE_S = 0.55;
const PART_GRAVITY = 16;
const PARK_Y = -9999;

export class BreakParticles {
  private readonly positions = new Float32Array(MAX * 3);
  private readonly colors = new Float32Array(MAX * 3);
  private readonly velocities = new Float32Array(MAX * 3);
  private readonly life = new Float32Array(MAX);
  private readonly geometry = new THREE.BufferGeometry();
  private cursor = 0;
  private liveCount = 0;

  constructor(scene: THREE.Scene, private readonly random: () => number = Math.random) {
    for (let i = 0; i < MAX; i++) this.positions[i * 3 + 1] = PARK_Y;
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const points = new THREE.Points(
      this.geometry,
      new THREE.PointsMaterial({ size: 0.14, vertexColors: true, sizeAttenuation: true }),
    );
    points.name = 'entity';
    points.frustumCulled = false;
    scene.add(points);
  }

  get count(): number {
    return this.liveCount;
  }

  /**
   * A small puff of `n` motes (projectile trails, footsteps): same pool as
   * bursts, gentler velocities so the motes hang as a wake.
   */
  puff(x: number, y: number, z: number, r: number, g: number, b: number, n = 2): void {
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      if ((this.life[i] ?? 0) <= 0) this.liveCount++;
      this.positions[i * 3] = x + (this.random() - 0.5) * 0.2;
      this.positions[i * 3 + 1] = y + (this.random() - 0.5) * 0.2;
      this.positions[i * 3 + 2] = z + (this.random() - 0.5) * 0.2;
      this.velocities[i * 3] = (this.random() - 0.5) * 0.6;
      this.velocities[i * 3 + 1] = 0.4 + this.random() * 0.6;
      this.velocities[i * 3 + 2] = (this.random() - 0.5) * 0.6;
      this.colors[i * 3] = r;
      this.colors[i * 3 + 1] = g;
      this.colors[i * 3 + 2] = b;
      this.life[i] = 0.3 + this.random() * 0.2;
    }
    this.geometry.getAttribute('color').needsUpdate = true;
    this.geometry.getAttribute('position').needsUpdate = true;
  }

  /** Burst at a block centre in (r, g, b) 0..1 colour. */
  burst(x: number, y: number, z: number, r: number, g: number, b: number): void {
    for (let n = 0; n < PER_BURST; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      if ((this.life[i] ?? 0) <= 0) this.liveCount++;
      this.positions[i * 3] = x + (this.random() - 0.5) * 0.7;
      this.positions[i * 3 + 1] = y + (this.random() - 0.5) * 0.7;
      this.positions[i * 3 + 2] = z + (this.random() - 0.5) * 0.7;
      this.velocities[i * 3] = (this.random() - 0.5) * 3.2;
      this.velocities[i * 3 + 1] = 1.5 + this.random() * 2.6;
      this.velocities[i * 3 + 2] = (this.random() - 0.5) * 3.2;
      const shade = 0.75 + this.random() * 0.4;
      this.colors[i * 3] = Math.min(1, r * shade);
      this.colors[i * 3 + 1] = Math.min(1, g * shade);
      this.colors[i * 3 + 2] = Math.min(1, b * shade);
      this.life[i] = LIFE_S * (0.6 + this.random() * 0.4);
    }
    this.geometry.getAttribute('color').needsUpdate = true;
    this.geometry.getAttribute('position').needsUpdate = true;
  }

  update(dt: number): void {
    if (this.liveCount === 0) return;
    for (let i = 0; i < MAX; i++) {
      const remaining = this.life[i] ?? 0;
      if (remaining <= 0) continue;
      const next = remaining - dt;
      this.life[i] = next;
      if (next <= 0) {
        this.positions[i * 3 + 1] = PARK_Y;
        this.liveCount--;
        continue;
      }
      this.velocities[i * 3 + 1] = (this.velocities[i * 3 + 1] ?? 0) - PART_GRAVITY * dt;
      this.positions[i * 3] = (this.positions[i * 3] ?? 0) + (this.velocities[i * 3] ?? 0) * dt;
      this.positions[i * 3 + 1] = (this.positions[i * 3 + 1] ?? 0) + (this.velocities[i * 3 + 1] ?? 0) * dt;
      this.positions[i * 3 + 2] = (this.positions[i * 3 + 2] ?? 0) + (this.velocities[i * 3 + 2] ?? 0) * dt;
    }
    this.geometry.getAttribute('position').needsUpdate = true;
  }
}
