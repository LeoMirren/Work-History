/**
 * Floating item-drop entities: broken blocks and mob loot appear in the world
 * as small spinning cubes the player walks over to collect, instead of
 * teleporting straight into the inventory.
 *
 * Each drop is a cube whose six faces are UV-pinned to the item's atlas tile
 * (the same trick as the mining-crack overlay in src/player/interaction.ts).
 * Geometries are cached per tile and shared between drops — never disposed —
 * and every mesh shares one material, bound to the session atlas via
 * `setAtlas`; until that call drops simulate but stay invisible.
 *
 * Simulation runs on the fixed tick with zero per-frame allocation: spawning
 * pops the drop up with a little horizontal scatter, gravity brings it down
 * until the cell below its centre is solid, then it idles (spin + bob) until
 * the player magnets it in, its lifetime expires, or the cap evicts it.
 */
import * as THREE from 'three';
import { tileUVRect } from '../engine/atlas';
import { iconTileFor } from '../world/items';
import type { SolidFn } from '../player/physics';

/** Edge length of a drop cube — item-sized, well under a block. */
export const DROP_SIZE = 0.28;
/** Downward acceleration while airborne (blocks/s²). */
export const DROP_GRAVITY = 18;
/** Upward launch speed at spawn — a small celebratory pop. */
export const DROP_POP_SPEED = 3.5;
/** Horizontal scatter speed at spawn: each axis uniform in ±this. */
export const DROP_SCATTER_SPEED = 1.2;
/** Resting height of the cube centre above the bottom of its (air) cell. */
export const DROP_REST_OFFSET = 0.18;
/** Distance within which a drop accelerates toward the player. */
export const MAGNET_RADIUS = 2.6;
/** Magnet pull strength (blocks/s²). */
export const MAGNET_ACCEL = 10;
/** Distance at which the player collects a drop. */
export const PICKUP_RADIUS = 1.1;
/** Seconds an uncollected drop lives before despawning. */
export const DROP_LIFETIME_S = 90;
/** Live-drop cap; spawning past it evicts the oldest drop first. */
export const MAX_DROPS = 80;

/** Idle bob amplitude: the mesh oscillates ±this around the rest height. */
const BOB_AMPLITUDE = 0.04;
/** Idle bob angular rate (rad/s) applied to the drop's age accumulator. */
const BOB_RATE = 2.5;
const PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS;
const MAGNET_RADIUS_SQ = MAGNET_RADIUS * MAGNET_RADIUS;

/** One live drop; (x,y,z) is the cube centre, the mesh mirrors it. */
interface Drop {
  id: number;
  count: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds since spawn; drives the bob phase and lifetime expiry. */
  age: number;
  /** True while parked on a solid floor (idle spin + bob, no physics). */
  grounded: boolean;
  readonly mesh: THREE.Mesh;
}

/**
 * The 48 UV floats (6 faces x 4 corners) pinning every face of a drop cube to
 * one atlas tile. BoxGeometry emits each face's corners in UV-fraction order
 * (0,1) (1,1) (0,0) (1,0) — top-left, top-right, bottom-left, bottom-right —
 * so writing the tile rect corners in that order keeps the sprite upright on
 * all six sides (mirrors `crackUVsFor` in src/player/interaction.ts).
 * Exported for tests.
 */
export function dropUVsFor(tile: number): Float32Array {
  const { u0, v0, u1, v1 } = tileUVRect(tile);
  const uvs = new Float32Array(48);
  for (let face = 0; face < 6; face++) {
    const o = face * 8;
    uvs[o] = u0;
    uvs[o + 1] = v1;
    uvs[o + 2] = u1;
    uvs[o + 3] = v1;
    uvs[o + 4] = u0;
    uvs[o + 5] = v0;
    uvs[o + 6] = u1;
    uvs[o + 7] = v0;
  }
  return uvs;
}

export class ItemDrops {
  /** Fired when the player collects a drop (the stack's id and count). */
  onPickup: ((id: number, count: number) => void) | null = null;

  /** Live drops, oldest first (spawn pushes; the cap evicts from the front). */
  private readonly drops: Drop[] = [];
  /** One geometry per atlas tile, shared by every drop of that tile; never disposed. */
  private readonly geometries = new Map<number, THREE.BoxGeometry>();
  /** The single material shared by all drop meshes; the atlas binds in setAtlas(). */
  private readonly material = new THREE.MeshBasicMaterial({
    transparent: true,
    alphaTest: 0.1,
    side: THREE.DoubleSide,
  });
  /** setAtlas() guard: drop meshes spawn (and stay) invisible until it flips. */
  private atlasReady = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly random: () => number = Math.random,
  ) {}

  /** Number of live drops. */
  get count(): number {
    return this.drops.length;
  }

  /** Test seam: number of per-tile geometries built so far (cache size). */
  get cachedGeometryCount(): number {
    return this.geometries.size;
  }

  /**
   * Bind the session's atlas texture to the one shared drop material. Until
   * this is called, drops simulate but their meshes stay invisible.
   */
  setAtlas(texture: THREE.Texture): void {
    this.material.map = texture;
    this.material.needsUpdate = true;
    this.atlasReady = true;
    for (const d of this.drops) d.mesh.visible = true;
  }

  /**
   * Drop `count` of item `id` at (x,y,z): a small cube pinned to the item's
   * atlas tile, popped upward with a little random horizontal scatter. Past
   * the live-drop cap the oldest drop is silently discarded first.
   */
  spawn(id: number, count: number, x: number, y: number, z: number): void {
    while (this.drops.length >= MAX_DROPS) this.evictOldest();
    const mesh = new THREE.Mesh(this.geometryFor(iconTileFor(id)), this.material);
    mesh.name = 'entity'; // opt out of main's shared-chunk-material dev sweep
    mesh.visible = this.atlasReady;
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.drops.push({
      id,
      count,
      x,
      y,
      z,
      vx: (this.random() * 2 - 1) * DROP_SCATTER_SPEED,
      vy: DROP_POP_SPEED,
      vz: (this.random() * 2 - 1) * DROP_SCATTER_SPEED,
      age: 0,
      grounded: false,
      mesh,
    });
  }

  /**
   * Fixed-tick simulation. `isSolid` probes the world for ground rest;
   * (px,py,pz) is the player position driving the magnet and pickup. Dead
   * drops are compacted out in place, so nothing allocates per frame.
   */
  fixedUpdate(dt: number, isSolid: SolidFn, px: number, py: number, pz: number): void {
    const drops = this.drops;
    let write = 0;
    for (let read = 0; read < drops.length; read++) {
      const d = drops[read];
      if (!d) continue;
      d.age += dt;

      // PICKUP: the player walked (or the magnet pulled the drop) into reach.
      const dx = px - d.x;
      const dy = py - d.y;
      const dz = pz - d.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq <= PICKUP_RADIUS_SQ) {
        this.scene.remove(d.mesh);
        this.onPickup?.(d.id, d.count);
        continue;
      }

      // LIFETIME: uncollected drops eventually despawn.
      if (d.age >= DROP_LIFETIME_S) {
        this.scene.remove(d.mesh);
        continue;
      }

      if (distSq <= MAGNET_RADIUS_SQ) {
        // MAGNET: accelerate straight at the player; gravity is suspended so
        // drops can float up ledges. distSq > PICKUP_RADIUS_SQ here, never 0.
        const pull = (MAGNET_ACCEL * dt) / Math.sqrt(distSq);
        d.vx += dx * pull;
        d.vy += dy * pull;
        d.vz += dz * pull;
        d.grounded = false;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.z += d.vz * dt;
        d.mesh.position.set(d.x, d.y, d.z);
      } else if (!d.grounded) {
        // Ballistic flight until the cell below the centre is solid.
        d.vy -= DROP_GRAVITY * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.z += d.vz * dt;
        const cx = Math.floor(d.x);
        const cy = Math.floor(d.y);
        const cz = Math.floor(d.z);
        if (d.vy <= 0) {
          if (isSolid(cx, cy, cz)) {
            // Tunnelled into a solid cell on a fast step: pop onto its top.
            this.rest(d, cy + 1);
          } else if (d.y <= cy + DROP_REST_OFFSET && isSolid(cx, cy - 1, cz)) {
            this.rest(d, cy);
          }
        }
        d.mesh.position.set(d.x, d.y, d.z);
      } else {
        // Idle: slow spin and bob in place; fall again if the floor vanishes.
        if (!isSolid(Math.floor(d.x), Math.floor(d.y) - 1, Math.floor(d.z))) {
          d.grounded = false;
        }
        d.mesh.rotation.y += dt;
        d.mesh.position.set(d.x, d.y + Math.sin(d.age * BOB_RATE) * BOB_AMPLITUDE, d.z);
      }

      drops[write++] = d;
    }
    drops.length = write;
  }

  /** Remove every live drop (world/dimension switch). Cached geometry survives. */
  clear(): void {
    for (const d of this.drops) this.scene.remove(d.mesh);
    this.drops.length = 0;
  }

  /** Cube geometry UV-pinned to `tile`, built once per tile and shared. */
  private geometryFor(tile: number): THREE.BoxGeometry {
    let geometry = this.geometries.get(tile);
    if (!geometry) {
      geometry = new THREE.BoxGeometry(DROP_SIZE, DROP_SIZE, DROP_SIZE);
      geometry.setAttribute('uv', new THREE.BufferAttribute(dropUVsFor(tile), 2));
      this.geometries.set(tile, geometry);
    }
    return geometry;
  }

  /** Cap enforcement: discard the oldest drop (no pickup fires for it). */
  private evictOldest(): void {
    const oldest = this.drops.shift();
    if (oldest) this.scene.remove(oldest.mesh);
  }

  /** Land in cell `cellY`: park the centre at the rest height and go idle. */
  private rest(d: Drop, cellY: number): void {
    d.y = cellY + DROP_REST_OFFSET;
    d.vx = 0;
    d.vy = 0;
    d.vz = 0;
    d.grounded = true;
  }
}
