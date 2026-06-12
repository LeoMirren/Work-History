/**
 * Block targeting and editing (§4.8): per-frame raycast drives the outline;
 * clicks break (LMB) or place (RMB) with placement rejected inside the player
 * AABB or into non-air/water cells.
 */
import * as THREE from 'three';
import { Block, BREAK_TIME, BREAKABLE, SOLID } from '../world/blocks';
import { CHUNK_HEIGHT } from '../world/chunk';
import { raycast, type RaycastHit } from '../world/raycast';
import { blockIntersectsBody, EYE_HEIGHT, type Body } from './physics';
import type { Input } from '../engine/input';
import type { GameMode, PlayerController } from './controller';
import type { World } from '../world/world';

export const REACH = 5.0;

const isTargetable = (id: number): boolean => SOLID[id] === 1;

/** §4.8 placement rules, pure for testability. */
export function canPlaceAt(currentId: number, bx: number, by: number, bz: number, body: Body): boolean {
  if (by < 0 || by >= CHUNK_HEIGHT) return false;
  if (currentId !== Block.air && currentId !== Block.water) return false;
  return !blockIntersectsBody(bx, by, bz, body);
}

export class Interaction {
  hasTarget = false;
  readonly hit: RaycastHit = { bx: 0, by: 0, bz: 0, nx: 0, ny: 0, nz: 0, distance: 0 };
  mode: GameMode = 'creative';
  /** Edit notification hook (block-tap audio). */
  onEdit: ((kind: 'break' | 'place', blockId: number) => void) | null = null;
  /** Survival hold-to-break progress, 0..1 (for the HUD bar). */
  breakProgress = 0;
  private breakX = Number.NaN;
  private breakY = Number.NaN;
  private breakZ = Number.NaN;
  private readonly outline: THREE.LineSegments;
  private readonly clicks: number[] = [];

  constructor(scene: THREE.Scene) {
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
      new THREE.LineBasicMaterial({ color: 0x101010 }),
    );
    this.outline.visible = false;
    scene.add(this.outline);
  }

  /** Per-frame: refresh the targeted block and apply queued clicks. */
  update(input: Input, world: World, player: PlayerController, selectedBlock: number, dt: number): void {
    const body = player.body;
    const eyeY = body.y + EYE_HEIGHT;
    const cosPitch = Math.cos(player.pitch);
    const dirX = -Math.sin(player.yaw) * cosPitch;
    const dirY = Math.sin(player.pitch);
    const dirZ = -Math.cos(player.yaw) * cosPitch;

    this.hasTarget = raycast(world.blockAt, isTargetable, body.x, eyeY, body.z, dirX, dirY, dirZ, REACH, this.hit);

    if (this.hasTarget) {
      this.outline.visible = true;
      this.outline.position.set(this.hit.bx + 0.5, this.hit.by + 0.5, this.hit.bz + 0.5);
    } else {
      this.outline.visible = false;
    }

    input.takeClicks(this.clicks);
    if (this.mode === 'survival') {
      this.updateTimedBreaking(input, world, dt);
      for (const button of this.clicks) {
        if (button === 2 && this.hasTarget) this.tryPlace(world, body, selectedBlock);
      }
    } else {
      for (const button of this.clicks) {
        if (!this.hasTarget) continue;
        if (button === 0) this.tryBreak(world);
        else if (button === 2) this.tryPlace(world, body, selectedBlock);
      }
    }
  }

  /** Survival: hold LMB on one block until its break time elapses. */
  private updateTimedBreaking(input: Input, world: World, dt: number): void {
    if (!this.hasTarget || !input.isButtonDown(0)) {
      this.breakProgress = 0;
      this.breakX = Number.NaN;
      return;
    }
    const { bx, by, bz } = this.hit;
    const id = world.getBlock(bx, by, bz);
    if (BREAKABLE[id] !== 1) {
      this.breakProgress = 0;
      this.breakX = Number.NaN;
      return;
    }
    if (bx !== this.breakX || by !== this.breakY || bz !== this.breakZ) {
      this.breakX = bx;
      this.breakY = by;
      this.breakZ = bz;
      this.breakProgress = 0;
    }
    this.breakProgress += dt / (BREAK_TIME[id] || Infinity);
    if (this.breakProgress >= 1) {
      world.setBlock(bx, by, bz, Block.air);
      this.onEdit?.('break', id);
      this.breakProgress = 0;
      this.breakX = Number.NaN;
    }
  }

  private tryBreak(world: World): void {
    const { bx, by, bz } = this.hit;
    const id = world.getBlock(bx, by, bz);
    if (BREAKABLE[id] !== 1) return;
    world.setBlock(bx, by, bz, Block.air);
    this.onEdit?.('break', id);
  }

  private tryPlace(world: World, body: Body, blockId: number): void {
    const bx = this.hit.bx + this.hit.nx;
    const by = this.hit.by + this.hit.ny;
    const bz = this.hit.bz + this.hit.nz;
    if (!canPlaceAt(world.getBlock(bx, by, bz), bx, by, bz, body)) return;
    world.setBlock(bx, by, bz, blockId);
    this.onEdit?.('place', blockId);
  }
}
