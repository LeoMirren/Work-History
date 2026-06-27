/**
 * Player controller: turns input into movement intent and integrates the
 * body each fixed step (§4.7). Horizontal motion is direct velocity control
 * (no inertia); vertical velocity persists for gravity/jumps.
 */
import type { PerspectiveCamera } from 'three';
import { Block } from '../world/blocks';
import {
  type Body,
  computeFallDamage,
  createBody,
  EYE_HEIGHT,
  MAX_HP,
  MAX_HUNGER,
  FLY_SPEED,
  GRAVITY,
  JUMP_VELOCITY,
  moveBody,
  type MoveResult,
  SNEAK_SPEED,
  type SolidFn,
  SPRINT_SPEED,
  TERMINAL_VELOCITY,
  WALK_SPEED,
  WATER_GRAVITY,
  WATER_HORIZONTAL_FACTOR,
  WATER_MAX_VERTICAL,
  WATER_SWIM_UP,
} from './physics';

const PITCH_LIMIT = Math.PI / 2 - 0.01;
const DOUBLE_TAP_WINDOW = 0.3; // seconds between W taps to latch sprint
const RESPAWN_Y = -10;

export type GameMode = 'creative' | 'survival';

export interface WorldView {
  isSolid: SolidFn;
  getBlock(x: number, y: number, z: number): number;
}

/** What the controller needs from input — Input satisfies it structurally. */
export interface ControlInput {
  isDown(code: string): boolean;
  takePressed(code: string): boolean;
}

export class PlayerController {
  readonly body: Body = createBody(0.5, 80, 0.5);
  /** yaw 0 looks toward -Z; positive pitch looks up. */
  yaw = 0;
  pitch = 0;
  flying = false;
  inWater = false;
  /** True while sprint speed applies (drives the FOV kick). */
  sprinting = false;
  mode: GameMode = 'creative';
  hp = MAX_HP;
  dead = false;
  /** Set by the game to drive a death screen; null means auto-respawn. */
  onDeath: (() => void) | null = null;
  hunger = MAX_HUNGER;
  /** Worn-armor damage reduction (0..0.7); main keeps it in sync with the slot. */
  armorReduction = 0;
  /** Highest y reached since last grounded, for fall damage. */
  private peakY = 0;
  private exhaustion = 0;
  private regenTimer = 0;
  private starveTimer = 0;
  private sprintLatch = false;
  private lastForwardTap = -Infinity;
  private time = 0;
  private spawnX = 0.5;
  private spawnY = 80;
  private spawnZ = 0.5;
  /** Previous-step position for render interpolation. */
  private prevX = 0.5;
  private prevY = 80;
  private prevZ = 0.5;
  private readonly moveResult: MoveResult = { hitX: false, hitY: false, hitZ: false };

  setSpawn(x: number, y: number, z: number): void {
    this.spawnX = x;
    this.spawnY = y;
    this.spawnZ = z;
  }

  setMode(mode: GameMode): void {
    this.mode = mode;
    if (mode === 'survival') this.flying = false;
  }

  teleport(x: number, y: number, z: number): void {
    this.body.x = x;
    this.body.y = y;
    this.body.z = z;
    this.body.vx = 0;
    this.body.vy = 0;
    this.body.vz = 0;
    this.prevX = x;
    this.prevY = y;
    this.prevZ = z;
    this.peakY = y;
  }

  look(dx: number, dy: number, sensitivity: number): void {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    if (this.pitch > PITCH_LIMIT) this.pitch = PITCH_LIMIT;
    if (this.pitch < -PITCH_LIMIT) this.pitch = -PITCH_LIMIT;
  }

  fixedUpdate(input: ControlInput, world: WorldView, dt: number): void {
    this.time += dt;
    const body = this.body;
    this.prevX = body.x;
    this.prevY = body.y;
    this.prevZ = body.z;
    if (this.dead) return; // frozen until the game calls respawn()

    if (input.takePressed('KeyF') && this.mode !== 'survival') {
      this.flying = !this.flying;
      body.vy = 0;
    }

    // Movement intent in the yaw frame, normalized so diagonals aren't faster.
    const forward = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
    const strafe = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    const len = Math.hypot(forward, strafe);
    const nf = len > 0 ? forward / len : 0;
    const ns = len > 0 ? strafe / len : 0;
    const dirX = -Math.sin(this.yaw) * nf + Math.cos(this.yaw) * ns;
    const dirZ = -Math.cos(this.yaw) * nf - Math.sin(this.yaw) * ns;

    // Sprint: Ctrl held, or W double-tapped (latched until forward releases).
    if (input.takePressed('KeyW')) {
      if (this.time - this.lastForwardTap < DOUBLE_TAP_WINDOW) this.sprintLatch = true;
      this.lastForwardTap = this.time;
    }
    if (forward <= 0) this.sprintLatch = false;
    const sneaking = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const sprinting =
      forward > 0 && !sneaking && (this.sprintLatch || input.isDown('ControlLeft') || input.isDown('ControlRight'));
    this.sprinting = sprinting && !this.flying;

    const feetBlock = world.getBlock(Math.floor(body.x), Math.floor(body.y + 0.05), Math.floor(body.z));
    const eyeBlock = world.getBlock(Math.floor(body.x), Math.floor(body.y + EYE_HEIGHT), Math.floor(body.z));
    this.inWater = feetBlock === Block.water || eyeBlock === Block.water;

    if (this.flying) {
      const vertical = (input.isDown('Space') ? 1 : 0) - (sneaking ? 1 : 0);
      body.vx = dirX * FLY_SPEED;
      body.vz = dirZ * FLY_SPEED;
      body.vy = vertical * FLY_SPEED;
    } else if (this.inWater) {
      const speed = (sneaking ? SNEAK_SPEED : sprinting ? SPRINT_SPEED : WALK_SPEED) * WATER_HORIZONTAL_FACTOR;
      body.vx = dirX * speed;
      body.vz = dirZ * speed;
      body.vy -= WATER_GRAVITY * dt;
      if (body.vy > WATER_MAX_VERTICAL) body.vy = WATER_MAX_VERTICAL;
      if (body.vy < -WATER_MAX_VERTICAL) body.vy = -WATER_MAX_VERTICAL;
      if (input.isDown('Space')) body.vy = WATER_SWIM_UP;
    } else {
      const speed = sneaking ? SNEAK_SPEED : sprinting ? SPRINT_SPEED : WALK_SPEED;
      body.vx = dirX * speed;
      body.vz = dirZ * speed;
      body.vy -= GRAVITY * dt;
      if (body.vy < -TERMINAL_VELOCITY) body.vy = -TERMINAL_VELOCITY;
      if (input.isDown('Space') && body.onGround) body.vy = JUMP_VELOCITY;
    }

    moveBody(world.isSolid, body, body.vx * dt, body.vy * dt, body.vz * dt, this.moveResult);

    if (this.mode === 'survival') {
      this.trackFall();
      this.updateHunger(dt, len > 0 && !this.flying);
    }

    if (body.y < RESPAWN_Y) {
      this.teleport(this.spawnX, this.spawnY, this.spawnZ);
    }
  }

  /**
   * Survival metabolism: activity burns food; being well-fed slowly regrows
   * health; an empty stomach drains it to a non-lethal floor.
   */
  private updateHunger(dt: number, moving: boolean): void {
    const EXHAUST_PER_HUNGER = 3;
    const REGEN_INTERVAL = 4;
    const STARVE_INTERVAL = 4;
    const STARVE_FLOOR = 1;

    let rate = 0.02; // resting metabolism
    if (moving) rate += this.sprinting ? 0.3 : 0.1;
    this.exhaustion += rate * dt;
    while (this.exhaustion >= EXHAUST_PER_HUNGER && this.hunger > 0) {
      this.exhaustion -= EXHAUST_PER_HUNGER;
      this.hunger--;
    }

    if (this.hunger >= 18 && this.hp < MAX_HP) {
      this.regenTimer += dt;
      if (this.regenTimer >= REGEN_INTERVAL) {
        this.regenTimer = 0;
        this.hp = Math.min(MAX_HP, this.hp + 1);
        this.exhaustion += EXHAUST_PER_HUNGER * 0.8; // healing costs food
      }
    } else {
      this.regenTimer = 0;
    }

    if (this.hunger === 0 && this.hp > STARVE_FLOOR) {
      this.starveTimer += dt;
      if (this.starveTimer >= STARVE_INTERVAL) {
        this.starveTimer = 0;
        this.hp = Math.max(STARVE_FLOOR, this.hp - 1);
      }
    } else {
      this.starveTimer = 0;
    }
  }

  /** Eat food: restores hunger, clamped to the max. */
  eat(food: number): void {
    this.hunger = Math.min(MAX_HUNGER, this.hunger + food);
  }

  /**
   * External damage (mob melee/projectiles). Survival only; worn armor reduces
   * it (always leaving at least 1 on a real hit). Routes through respawn.
   */
  hurt(amount: number): void {
    if (this.mode !== 'survival' || amount <= 0) return;
    const mitigated = Math.max(1, Math.round(amount * (1 - this.armorReduction)));
    this.applyDamage(mitigated);
  }

  /** Fall-damage bookkeeping: water entry and flight always break a fall. */
  private trackFall(): void {
    const body = this.body;
    if (this.flying || this.inWater) {
      this.peakY = body.y;
    } else if (!body.onGround) {
      if (body.y > this.peakY) this.peakY = body.y;
    } else {
      const damage = computeFallDamage(this.peakY - body.y);
      if (damage > 0) this.applyDamage(damage);
      this.peakY = body.y;
    }
  }

  /** Eat/regen: clamped to MAX_HP. */
  heal(amount: number): void {
    this.hp = Math.min(MAX_HP, this.hp + amount);
  }

  private applyDamage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp === 0) {
      if (this.onDeath) {
        // Defer to the game (death screen drives respawn()).
        this.dead = true;
        this.body.vx = 0;
        this.body.vy = 0;
        this.body.vz = 0;
        this.onDeath();
      } else {
        // No handler (tests): respawn immediately.
        this.respawn();
      }
    }
  }

  /** Respawn at the bound spawn point with full vitals. */
  respawn(): void {
    this.teleport(this.spawnX, this.spawnY, this.spawnZ);
    this.hp = MAX_HP;
    this.hunger = MAX_HUNGER;
    this.exhaustion = 0;
    this.dead = false;
  }

  /** Interpolated camera placement; alpha is the accumulator fraction. */
  applyToCamera(camera: PerspectiveCamera, alpha: number): void {
    const x = this.prevX + (this.body.x - this.prevX) * alpha;
    const y = this.prevY + (this.body.y - this.prevY) * alpha;
    const z = this.prevZ + (this.body.z - this.prevZ) * alpha;
    camera.position.set(x, y + EYE_HEIGHT, z);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
