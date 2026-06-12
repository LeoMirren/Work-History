/**
 * Hostile mobs ("stalkers"): dark humanoids that appear at night near the
 * player, chase and strike on contact, and burn away in daylight. They share
 * the entity AABB physics and the ray-pick/hurt interface with animals, so
 * the player fights them with the same left-click.
 */
import * as THREE from 'three';
import { Block, SOLID } from '../world/blocks';
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

export const STALKER_HALF_WIDTH = 0.3;
export const STALKER_HEIGHT = 1.8;
export const STALKER_HP = 6;
export const NIGHT_BRIGHTNESS = 0.34; // spawn below this; sunburn above ~0.6
const DAY_BRIGHTNESS = 0.6;
const MAX_STALKERS = 8;
const SPAWN_INTERVAL_S = 3;
const SPAWN_MIN_DIST = 14;
const SPAWN_MAX_DIST = 34;
const DESPAWN_DIST = 70;
const AGGRO_RANGE = 26;
const MOVE_SPEED = 3.1;
const HOP_VELOCITY = 7.4;
const ATTACK_RANGE = 1.6;
const ATTACK_DAMAGE = 2;
const ATTACK_COOLDOWN_S = 1.0;
const SUNBURN_S = 4;

export interface Stalker {
  readonly body: Body;
  yaw: number;
  hp: number;
  attackCd: number;
  sunTimer: number;
  wanderTimer: number;
  readonly group: THREE.Group;
}

const torsoMaterial = new THREE.MeshBasicMaterial({ color: 0x2b2f3a });
const headMaterial = new THREE.MeshBasicMaterial({ color: 0x3a4150 });

function makeStalkerMesh(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'entity';
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.2, 0.4), torsoMaterial);
  torso.name = 'entity';
  torso.position.set(0, 0.85, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), headMaterial);
  head.name = 'entity';
  head.position.set(0, 1.65, 0);
  group.add(torso, head);
  return group;
}

export class HostileSystem {
  readonly stalkers: Stalker[] = [];
  private world: WorldView | null = null;
  private spawnTimer = 0;
  private readonly moveResult: MoveResult = { hitX: false, hitY: false, hitZ: false };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly random: () => number = Math.random,
  ) {}

  setWorld(world: WorldView | null): void {
    this.clear();
    this.world = world;
  }

  clear(): void {
    for (const s of this.stalkers) this.scene.remove(s.group);
    this.stalkers.length = 0;
    this.spawnTimer = 0;
  }

  get count(): number {
    return this.stalkers.length;
  }

  spawnAt(x: number, y: number, z: number): Stalker {
    const stalker: Stalker = {
      body: createBody(x, y, z),
      yaw: this.random() * Math.PI * 2,
      hp: STALKER_HP,
      attackCd: 0,
      sunTimer: 0,
      wanderTimer: 0,
      group: makeStalkerMesh(),
    };
    this.scene.add(stalker.group);
    this.stalkers.push(stalker);
    return stalker;
  }

  private trySpawn(px: number, pz: number): void {
    const world = this.world;
    if (!world || this.stalkers.length >= MAX_STALKERS) return;
    const angle = this.random() * Math.PI * 2;
    const dist = SPAWN_MIN_DIST + this.random() * (SPAWN_MAX_DIST - SPAWN_MIN_DIST);
    const x = Math.floor(px + Math.cos(angle) * dist);
    const z = Math.floor(pz + Math.sin(angle) * dist);
    for (let y = 120; y >= 1; y--) {
      const id = world.getBlock(x, y, z);
      if (id === Block.air || id === Block.water) continue;
      if (SOLID[id] === 1 && world.getBlock(x, y + 1, z) === Block.air) {
        this.spawnAt(x + 0.5, y + 1, z + 0.5);
      }
      return;
    }
  }

  /**
   * Advance all stalkers. `brightness` is the day/night value; below
   * NIGHT_BRIGHTNESS they spawn, above DAY_BRIGHTNESS they burn. `hitPlayer`
   * applies melee damage.
   */
  fixedUpdate(
    dt: number,
    px: number,
    py: number,
    pz: number,
    brightness: number,
    hitPlayer: (damage: number) => void,
  ): void {
    const world = this.world;
    if (!world) return;
    if (brightness < NIGHT_BRIGHTNESS) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = SPAWN_INTERVAL_S;
        this.trySpawn(px, pz);
      }
    }
    for (let i = this.stalkers.length - 1; i >= 0; i--) {
      const s = this.stalkers[i];
      if (!s) continue;
      const dx = s.body.x - px;
      const dz = s.body.z - pz;
      const distSq = dx * dx + dz * dz;
      // Burn in daylight, despawn when far.
      if (brightness > DAY_BRIGHTNESS) {
        s.sunTimer += dt;
      } else {
        s.sunTimer = 0;
      }
      if (s.sunTimer > SUNBURN_S || distSq > DESPAWN_DIST * DESPAWN_DIST || s.body.y < -10) {
        this.scene.remove(s.group);
        this.stalkers.splice(i, 1);
        continue;
      }
      this.step(s, world, dt, px, py, pz, distSq, hitPlayer);
      s.group.position.set(s.body.x, s.body.y, s.body.z);
      s.group.rotation.set(0, s.yaw, 0);
    }
  }

  private step(
    s: Stalker,
    world: WorldView,
    dt: number,
    px: number,
    py: number,
    pz: number,
    distSq: number,
    hitPlayer: (damage: number) => void,
  ): void {
    const body = s.body;
    if (s.attackCd > 0) s.attackCd -= dt;

    const aggro = distSq < AGGRO_RANGE * AGGRO_RANGE;
    if (aggro) {
      s.yaw = Math.atan2(px - body.x, pz - body.z); // face the player
      body.vx = (px - body.x) / Math.max(0.001, Math.hypot(px - body.x, pz - body.z)) * MOVE_SPEED;
      body.vz = (pz - body.z) / Math.max(0.001, Math.hypot(px - body.x, pz - body.z)) * MOVE_SPEED;
    } else {
      s.wanderTimer -= dt;
      if (s.wanderTimer <= 0) {
        s.yaw = this.random() * Math.PI * 2;
        s.wanderTimer = 1 + this.random() * 3;
      }
      body.vx = -Math.sin(s.yaw) * MOVE_SPEED * 0.5;
      body.vz = -Math.cos(s.yaw) * MOVE_SPEED * 0.5;
    }

    body.vy -= GRAVITY * dt;
    if (body.vy < -TERMINAL_VELOCITY) body.vy = -TERMINAL_VELOCITY;

    moveBody(
      world.isSolid,
      body,
      body.vx * dt,
      body.vy * dt,
      body.vz * dt,
      this.moveResult,
      STALKER_HALF_WIDTH,
      STALKER_HEIGHT,
    );
    if (body.onGround && (this.moveResult.hitX || this.moveResult.hitZ)) {
      body.vy = HOP_VELOCITY; // climb obstacles toward the player
    }

    // Melee: in range (including vertical), off cooldown.
    const dyEye = Math.abs(body.y - py);
    if (aggro && s.attackCd <= 0 && distSq < ATTACK_RANGE * ATTACK_RANGE && dyEye < 2) {
      hitPlayer(ATTACK_DAMAGE);
      s.attackCd = ATTACK_COOLDOWN_S;
    }
  }

  raycastNearest(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDist: number,
  ): { stalker: Stalker; distance: number } | null {
    let best: Stalker | null = null;
    let bestT = maxDist;
    for (const s of this.stalkers) {
      const b = s.body;
      const t = rayAABB(
        ox, oy, oz, dx, dy, dz,
        b.x - STALKER_HALF_WIDTH, b.y, b.z - STALKER_HALF_WIDTH,
        b.x + STALKER_HALF_WIDTH, b.y + STALKER_HEIGHT, b.z + STALKER_HALF_WIDTH,
      );
      if (t !== null && t <= bestT) {
        best = s;
        bestT = t;
      }
    }
    return best ? { stalker: best, distance: bestT } : null;
  }

  /** Strike a stalker; returns true if it died. */
  hurt(stalker: Stalker): boolean {
    stalker.hp -= 2;
    stalker.body.vy = 4; // knock-up
    if (stalker.hp <= 0) {
      const index = this.stalkers.indexOf(stalker);
      if (index >= 0) this.stalkers.splice(index, 1);
      this.scene.remove(stalker.group);
      return true;
    }
    return false;
  }
}
