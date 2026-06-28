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

interface Stone {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  readonly mesh: THREE.Mesh;
}

const stoneMaterial = new THREE.MeshBasicMaterial({ color: 0x9a9ca6 });
const stoneGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);

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
    this.scene.add(mesh);
    this.stones.push({
      x,
      y,
      z,
      vx: (dx / len) * THROW_SPEED,
      vy: (dy / len) * THROW_SPEED,
      vz: (dz / len) * THROW_SPEED,
      life: PROJ_LIFE_S,
      mesh,
    });
  }

  fixedUpdate(dt: number, isSolid: SolidFn, strike: StrikeFn): void {
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
    }
  }

  private remove(i: number): void {
    const s = this.stones[i];
    if (s) this.scene.remove(s.mesh);
    this.stones.splice(i, 1);
  }
}
