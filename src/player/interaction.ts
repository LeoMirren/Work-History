/**
 * Block targeting and editing (§4.8): per-frame raycast drives the outline;
 * clicks break (LMB) or place (RMB) with placement rejected inside the player
 * AABB or into non-air/water cells.
 *
 * Creative: instant break, infinite placement from the fixed hotbar.
 * Survival: hold-to-break with tool-adjusted times, drops collected into the
 * inventory, placement consumes from the selected stack.
 */
import * as THREE from 'three';
import { Block, BREAKABLE, SOLID } from '../world/blocks';
import { CHUNK_HEIGHT } from '../world/chunk';
import { raycast, type RaycastHit } from '../world/raycast';
import { breakSecondsFor, dropFor, isBlockId, Item, MEAT_FOOD } from '../world/items';
import { blockIntersectsBody, EYE_HEIGHT, MAX_HUNGER, type Body } from './physics';
import type { Input } from '../engine/input';
import type { AnimalSystem } from '../entities/animals';
import type { HostileSystem } from '../entities/hostiles';
import type { GameMode, PlayerController } from './controller';
import type { Inventory } from './inventory';
import type { World } from '../world/world';

export const REACH = 5.0;

const isTargetable = (id: number): boolean => SOLID[id] === 1;

/** §4.8 placement rules, pure for testability. */
export function canPlaceAt(currentId: number, bx: number, by: number, bz: number, body: Body): boolean {
  if (by < 0 || by >= CHUNK_HEIGHT) return false;
  if (currentId !== Block.air && currentId !== Block.water) return false;
  return !blockIntersectsBody(bx, by, bz, body);
}

export interface HotbarState {
  /** Placement block in creative mode. */
  creativeBlock: number;
  /** Survival inventory (null in creative). */
  inventory: Inventory | null;
  /** Selected hotbar slot index. */
  slot: number;
}

export class Interaction {
  hasTarget = false;
  readonly hit: RaycastHit = { bx: 0, by: 0, bz: 0, nx: 0, ny: 0, nz: 0, distance: 0 };
  mode: GameMode = 'creative';
  /** Huntable wildlife (bound by main; punches hit these before blocks). */
  animals: AnimalSystem | null = null;
  /** Hostile mobs (bound by main; struck by the same punch). */
  hostiles: HostileSystem | null = null;
  /** Edit notification hook (block-tap audio). */
  onEdit: ((kind: 'break' | 'place', blockId: number) => void) | null = null;
  /** Right-click on a container block (chest): opens it, consumes the click. */
  onOpenContainer: ((x: number, y: number, z: number) => boolean) | null = null;
  /** Right-click a riftframe to travel between dimensions. */
  onActivateRift: ((x: number, y: number, z: number) => boolean) | null = null;
  /** Block placed/broken at a world cell, for container bookkeeping. */
  onBlockChanged: ((kind: 'place' | 'break', id: number, x: number, y: number, z: number) => void) | null = null;
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
  update(input: Input, world: World, player: PlayerController, dt: number, hotbar: HotbarState): void {
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
    if (this.mode === 'survival' && hotbar.inventory) {
      this.updateTimedBreaking(input, world, dt, hotbar.inventory, hotbar);
      for (const button of this.clicks) {
        if (button === 0) {
          this.tryPunchAnimal(body.x, eyeY, body.z, dirX, dirY, dirZ, hotbar.inventory);
        } else if (button === 2) {
          if (this.tryActivateRift(world)) continue;
          if (this.tryOpenContainer(world)) continue;
          if (this.tryEat(player, hotbar)) continue;
          if (this.hasTarget) this.trySurvivalPlace(world, body, hotbar);
        }
      }
    } else {
      for (const button of this.clicks) {
        if (button === 0) {
          if (this.tryPunchAnimal(body.x, eyeY, body.z, dirX, dirY, dirZ, null)) continue;
          if (this.hasTarget) this.tryBreak(world);
        } else if (button === 2 && this.hasTarget) {
          if (this.tryActivateRift(world)) continue;
          if (this.tryOpenContainer(world)) continue;
          this.tryPlace(world, body, hotbar.creativeBlock);
        }
      }
    }
  }

  /** Right-click a chest: hand off to the container hook. */
  private tryOpenContainer(world: World): boolean {
    if (!this.hasTarget || !this.onOpenContainer) return false;
    const { bx, by, bz } = this.hit;
    if (world.getBlock(bx, by, bz) !== Block.chest) return false;
    return this.onOpenContainer(bx, by, bz);
  }

  /** Right-click a riftframe: hand off to the dimension-travel hook. */
  private tryActivateRift(world: World): boolean {
    if (!this.hasTarget || !this.onActivateRift) return false;
    const { bx, by, bz } = this.hit;
    if (world.getBlock(bx, by, bz) !== Block.riftframe) return false;
    return this.onActivateRift(bx, by, bz);
  }

  /** Punch the nearest entity (animal or hostile) if closer than the block. */
  private tryPunchAnimal(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    inventory: Inventory | null,
  ): boolean {
    const animalHit = this.animals?.raycastNearest(ox, oy, oz, dx, dy, dz, REACH) ?? null;
    const hostileHit = this.hostiles?.raycastNearest(ox, oy, oz, dx, dy, dz, REACH) ?? null;
    // Pick the nearest of the two entity hits.
    const useHostile =
      hostileHit !== null && (animalHit === null || hostileHit.distance <= animalHit.distance);
    const dist = useHostile ? hostileHit?.distance : animalHit?.distance;
    if (dist === undefined) return false;
    if (this.hasTarget && this.hit.distance < dist) return false;
    if (useHostile && hostileHit) {
      this.hostiles?.hurt(hostileHit.stalker);
    } else if (animalHit) {
      const drops = this.animals?.hurt(animalHit.animal) ?? null;
      if (drops && inventory) inventory.add(drops.id, drops.count);
    }
    this.onEdit?.('break', Item.meat); // thud
    return true;
  }

  /** Holding meat: right-click eats it when hungry. Returns true if consumed. */
  private tryEat(player: PlayerController, hotbar: HotbarState): boolean {
    const inventory = hotbar.inventory;
    const stack = inventory?.slots[hotbar.slot];
    if (!inventory || !stack || stack.id !== Item.meat) return false;
    if (player.hunger >= MAX_HUNGER) return false;
    if (!inventory.consumeOne(hotbar.slot)) return false;
    player.eat(MEAT_FOOD);
    this.onEdit?.('place', Item.meat);
    return true;
  }

  private heldId(hotbar: HotbarState): number {
    return hotbar.inventory?.slots[hotbar.slot]?.id ?? 0;
  }

  /** Survival: hold LMB on one block until its tool-adjusted time elapses. */
  private updateTimedBreaking(
    input: Input,
    world: World,
    dt: number,
    inventory: Inventory,
    hotbar: HotbarState,
  ): void {
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
    const held = this.heldId(hotbar);
    const seconds = breakSecondsFor(id, held);
    this.breakProgress += Number.isFinite(seconds) && seconds > 0 ? dt / seconds : 0;
    if (this.breakProgress >= 1) {
      world.setBlock(bx, by, bz, Block.air);
      const drop = dropFor(id, held);
      if (drop) inventory.add(drop.id, drop.count); // overflow is simply lost
      this.onEdit?.('break', id);
      this.onBlockChanged?.('break', id, bx, by, bz);
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
    this.onBlockChanged?.('break', id, bx, by, bz);
  }

  private tryPlace(world: World, body: Body, blockId: number): void {
    const bx = this.hit.bx + this.hit.nx;
    const by = this.hit.by + this.hit.ny;
    const bz = this.hit.bz + this.hit.nz;
    if (blockId <= 0) return;
    if (!canPlaceAt(world.getBlock(bx, by, bz), bx, by, bz, body)) return;
    world.setBlock(bx, by, bz, blockId);
    this.onEdit?.('place', blockId);
    this.onBlockChanged?.('place', blockId, bx, by, bz);
  }

  /** Survival placement consumes one item from the selected stack. */
  private trySurvivalPlace(world: World, body: Body, hotbar: HotbarState): void {
    const inventory = hotbar.inventory;
    const stack = inventory?.slots[hotbar.slot];
    if (!inventory || !stack || !isBlockId(stack.id)) return;
    const bx = this.hit.bx + this.hit.nx;
    const by = this.hit.by + this.hit.ny;
    const bz = this.hit.bz + this.hit.nz;
    if (!canPlaceAt(world.getBlock(bx, by, bz), bx, by, bz, body)) return;
    const blockId = stack.id;
    if (!inventory.consumeOne(hotbar.slot)) return;
    world.setBlock(bx, by, bz, blockId);
    this.onEdit?.('place', blockId);
    this.onBlockChanged?.('place', blockId, bx, by, bz);
  }
}
