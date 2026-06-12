/**
 * Passive animals ("trundlers"): blocky critters that wander the grass near
 * the player, hop over obstacles, float in water, and can be hunted for meat.
 * Physics reuses the AABB sweep with entity dimensions; rendering is two
 * boxes per animal sharing static materials. Not persisted — they respawn
 * around the player like ambient wildlife.
 */
import * as THREE from 'three';
import { Block } from '../world/blocks';
import { Item } from '../world/items';
import { rayAABB } from '../world/raycast';
import {
  createBody,
  GRAVITY,
  moveBody,
  TERMINAL_VELOCITY,
  type Body,
  type MoveResult,
} from '../player/physics';
import type { WorldView } from '../player/controller';

export const ANIMAL_HALF_WIDTH = 0.35;
export const ANIMAL_HEIGHT = 0.7;
export const ANIMAL_HP = 3;
const MAX_ANIMALS = 10;
const SPAWN_INTERVAL_S = 2.5;
const SPAWN_MIN_DIST = 16;
const SPAWN_MAX_DIST = 38;
const DESPAWN_DIST = 72;
const WALK_SPEED = 1.6;
const HOP_VELOCITY = 7.4;

export interface Animal {
  readonly body: Body;
  yaw: number;
  hp: number;
  moving: boolean;
  timer: number;
  readonly group: THREE.Group;
}

const bodyMaterial = new THREE.MeshBasicMaterial({ color: 0xb08a5a });
const headMaterial = new THREE.MeshBasicMaterial({ color: 0x7a5c39 });

function makeAnimalMesh(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'entity';
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.7), bodyMaterial);
  torso.name = 'entity';
  torso.position.set(0, 0.32, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.3), headMaterial);
  head.name = 'entity';
  head.position.set(0, 0.6, -0.42);
  group.add(torso, head);
  return group;
}

export class AnimalSystem {
  readonly animals: Animal[] = [];
  private world: WorldView | null = null;
  private spawnTimer = 0;
  private readonly moveResult: MoveResult = { hitX: false, hitY: false, hitZ: false };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly random: () => number = Math.random,
  ) {}

  /** Bind to a world (session start) — clears any previous population. */
  setWorld(world: WorldView | null): void {
    this.clear();
    this.world = world;
  }

  clear(): void {
    for (const animal of this.animals) this.scene.remove(animal.group);
    this.animals.length = 0;
    this.spawnTimer = 0;
  }

  get count(): number {
    return this.animals.length;
  }

  /** Place an animal directly (also the test seam). */
  spawnAt(x: number, y: number, z: number): Animal {
    const animal: Animal = {
      body: createBody(x, y, z),
      yaw: this.random() * Math.PI * 2,
      hp: ANIMAL_HP,
      moving: false,
      timer: 0.5 + this.random() * 2,
      group: makeAnimalMesh(),
    };
    this.scene.add(animal.group);
    this.animals.push(animal);
    return animal;
  }

  /** Try to spawn one animal on grass near (but not next to) the player. */
  private trySpawn(px: number, pz: number): void {
    const world = this.world;
    if (!world || this.animals.length >= MAX_ANIMALS) return;
    const angle = this.random() * Math.PI * 2;
    const dist = SPAWN_MIN_DIST + this.random() * (SPAWN_MAX_DIST - SPAWN_MIN_DIST);
    const x = Math.floor(px + Math.cos(angle) * dist);
    const z = Math.floor(pz + Math.sin(angle) * dist);
    for (let y = 120; y >= 1; y--) {
      const id = world.getBlock(x, y, z);
      if (id === Block.air) continue;
      if (id === Block.grass) this.spawnAt(x + 0.5, y + 1, z + 0.5);
      return; // hit a non-grass surface (or water): no spawn here
    }
  }

  fixedUpdate(dt: number, px: number, py: number, pz: number): void {
    const world = this.world;
    if (!world) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = SPAWN_INTERVAL_S;
      this.trySpawn(px, pz);
    }
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const animal = this.animals[i];
      if (!animal) continue;
      const body = animal.body;
      const dx = body.x - px;
      const dz = body.z - pz;
      if (dx * dx + dz * dz > DESPAWN_DIST * DESPAWN_DIST || body.y < -10) {
        this.scene.remove(animal.group);
        this.animals.splice(i, 1);
        continue;
      }
      this.step(animal, world, dt);
      animal.group.position.set(body.x, body.y, body.z);
      animal.group.rotation.set(0, animal.yaw, 0);
    }
    void py;
  }

  private step(animal: Animal, world: WorldView, dt: number): void {
    const body = animal.body;
    animal.timer -= dt;
    if (animal.timer <= 0) {
      animal.moving = this.random() < 0.6;
      animal.yaw = this.random() * Math.PI * 2;
      animal.timer = 1 + this.random() * 3;
    }
    const speed = animal.moving ? WALK_SPEED : 0;
    body.vx = -Math.sin(animal.yaw) * speed;
    body.vz = -Math.cos(animal.yaw) * speed;
    const inWater = world.getBlock(Math.floor(body.x), Math.floor(body.y + 0.1), Math.floor(body.z)) === Block.water;
    if (inWater) {
      body.vy = Math.min(2, body.vy + 12 * dt); // buoyancy
    } else {
      body.vy -= GRAVITY * dt;
      if (body.vy < -TERMINAL_VELOCITY) body.vy = -TERMINAL_VELOCITY;
    }
    moveBody(
      world.isSolid,
      body,
      body.vx * dt,
      body.vy * dt,
      body.vz * dt,
      this.moveResult,
      ANIMAL_HALF_WIDTH,
      ANIMAL_HEIGHT,
    );
    // Hop over single-block obstacles when walking into them.
    if (animal.moving && body.onGround && (this.moveResult.hitX || this.moveResult.hitZ)) {
      body.vy = HOP_VELOCITY;
    }
  }

  /** Nearest animal hit by the ray within maxDist, or null. */
  raycastNearest(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDist: number,
  ): { animal: Animal; distance: number } | null {
    let best: Animal | null = null;
    let bestT = maxDist;
    for (const animal of this.animals) {
      const b = animal.body;
      const t = rayAABB(
        ox, oy, oz, dx, dy, dz,
        b.x - ANIMAL_HALF_WIDTH, b.y, b.z - ANIMAL_HALF_WIDTH,
        b.x + ANIMAL_HALF_WIDTH, b.y + ANIMAL_HEIGHT, b.z + ANIMAL_HALF_WIDTH,
      );
      if (t !== null && t <= bestT) {
        best = animal;
        bestT = t;
      }
    }
    return best ? { animal: best, distance: bestT } : null;
  }

  /** Punch an animal; returns its drops when it dies, else null. */
  hurt(animal: Animal): { id: number; count: number } | null {
    animal.hp--;
    if (animal.hp <= 0) {
      const index = this.animals.indexOf(animal);
      if (index >= 0) this.animals.splice(index, 1);
      this.scene.remove(animal.group);
      return { id: Item.meat, count: 1 + (this.random() < 0.5 ? 1 : 0) };
    }
    animal.body.vy = 5; // flinch hop
    return null;
  }
}
