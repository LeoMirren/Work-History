/**
 * Player thrown projectiles (throwing stones). A small ballistic system: each
 * stone flies along the throw direction under light gravity, dies on terrain
 * or after a short life, and on each step sweeps for a mob hit via a caller
 * supplied `strike` (which reuses the entity ray-pick/hurt path).
 */
import * as THREE from 'three';
import type { SolidFn } from '../player/physics';

export const THROW_SPEED = 24;
const PROJ_GRAVITY = 18; // lighter than the player's, for a flat-ish arc
const PROJ_LIFE_S = 2.5;

/** Returns true if a mob in the swept segment was hit (stone is consumed). */
export type StrikeFn = (
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
) => boolean;

/** Every ~this many seconds a flying stone sheds one dust-trail mote. */
const TRAIL_INTERVAL_S = 0.07;
/** Emit a trail mote at (x, y, z) — main routes this to the particle pool. */
export type TrailFn = (x: number, y: number, z: number) => void;

interface Stone {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  /** Per-stone tumble axis speeds — thrown rocks visibly spin in flight. */
  spinX: number;
  spinY: number;
  trailAt: number;
  readonly mesh: THREE.Mesh;
}

// A chipped two-tone rock: a grey core with a darker offset chip box, so the
// tumble is readable in flight (a flat cube reads as a static dot).
const stoneMaterial = new THREE.MeshBasicMaterial({ color: 0x9a9ca6 });
const stoneChipMaterial = new THREE.MeshBasicMaterial({ color: 0x6f7280 });
const stoneGeometry = new THREE.BoxGeometry(0.2, 0.16, 0.18);
const stoneChipGeometry = new THREE.BoxGeometry(0.12, 0.1, 0.12);

export class ThrownProjectiles {
  private readonly stones: Stone[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  get count(): number {
    return this.stones.length;
  }

  clear(): void {
    for (const s of this.stones) this.scene.remove(s.mesh);
    this.stones.length = 0;
  }

  /** Launch a stone from (x,y,z) along the (not-necessarily-unit) direction. */
  throw(x: number, y: number, z: number, dx: number, dy: number, dz: number): void {
    const len = Math.hypot(dx, dy, dz) || 1;
    const mesh = new THREE.Mesh(stoneGeometry, stoneMaterial);
    mesh.name = 'entity';
    mesh.position.set(x, y, z);
    const chip = new THREE.Mesh(stoneChipGeometry, stoneChipMaterial);
    chip.name = 'entity';
    chip.position.set(0.05, 0.04, -0.04);
    mesh.add(chip);
    this.scene.add(mesh);
    this.stones.push({
      x,
      y,
      z,
      vx: (dx / len) * THROW_SPEED,
      vy: (dy / len) * THROW_SPEED,
      vz: (dz / len) * THROW_SPEED,
      life: PROJ_LIFE_S,
      spinX: 9 + (x * 7 + z * 13) % 5, // deterministic per-launch variety
      spinY: 6 + (y * 11) % 4,
      trailAt: TRAIL_INTERVAL_S,
      mesh,
    });
  }

  fixedUpdate(dt: number, isSolid: SolidFn, strike: StrikeFn, trail?: TrailFn): void {
    for (let i = this.stones.length - 1; i >= 0; i--) {
      const s = this.stones[i];
      if (!s) continue;
      s.vy -= PROJ_GRAVITY * dt;
      const stepLen = Math.hypot(s.vx, s.vy, s.vz) * dt;
      // Sweep for a mob hit across this step before moving.
      if (stepLen > 0 && strike(s.x, s.y, s.z, s.vx, s.vy, s.vz, stepLen)) {
        this.remove(i);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.life -= dt;
      if (isSolid(Math.floor(s.x), Math.floor(s.y), Math.floor(s.z)) || s.life <= 0 || s.y < -16) {
        this.remove(i);
        continue;
      }
      s.mesh.position.set(s.x, s.y, s.z);
      // Tumble in flight, and shed a small dust mote every few frames.
      s.mesh.rotation.x += s.spinX * dt;
      s.mesh.rotation.y += s.spinY * dt;
      s.trailAt -= dt;
      if (trail && s.trailAt <= 0) {
        s.trailAt = TRAIL_INTERVAL_S;
        trail(s.x, s.y, s.z);
      }
    }
  }

  private remove(i: number): void {
    const s = this.stones[i];
    if (s) this.scene.remove(s.mesh);
    this.stones.splice(i, 1);
  }
}
