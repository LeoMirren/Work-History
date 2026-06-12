/**
 * Player controller: turns input into movement intent and integrates the
 * body each fixed step (§4.7). Horizontal motion is direct velocity control
 * (no inertia); vertical velocity persists for gravity/jumps.
 */
import type { PerspectiveCamera } from 'three';
import type { Input } from '../engine/input';
import { Block } from '../world/blocks';
import {
  type Body,
  createBody,
  EYE_HEIGHT,
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

export interface WorldView {
  isSolid: SolidFn;
  getBlock(x: number, y: number, z: number): number;
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
  }

  look(dx: number, dy: number, sensitivity: number): void {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    if (this.pitch > PITCH_LIMIT) this.pitch = PITCH_LIMIT;
    if (this.pitch < -PITCH_LIMIT) this.pitch = -PITCH_LIMIT;
  }

  fixedUpdate(input: Input, world: WorldView, dt: number): void {
    this.time += dt;
    const body = this.body;
    this.prevX = body.x;
    this.prevY = body.y;
    this.prevZ = body.z;

    if (input.takePressed('KeyF')) {
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

    if (body.y < RESPAWN_Y) {
      this.teleport(this.spawnX, this.spawnY, this.spawnZ);
    }
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
