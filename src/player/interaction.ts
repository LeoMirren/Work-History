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
import { bonusDropFor, breakSecondsFor, dropFor, foodValue, isBlockId, isFood, isThrowable, Item, useBucketOn } from '../world/items';
import { isCrop, plantResult, tillResult } from '../world/farming';
import { forEachTreeBlock } from '../world/worldgen';
import { blockIntersectsBody, EYE_HEIGHT, MAX_HUNGER, type Body } from './physics';
import type { Input } from '../engine/input';
import { ANIMAL_HALF_WIDTH, ANIMAL_HEIGHT, type AnimalSystem } from '../entities/animals';
import { STALKER_HALF_WIDTH, STALKER_HEIGHT, type HostileSystem } from '../entities/hostiles';
import type { GameMode, PlayerController } from './controller';
import type { Inventory } from './inventory';
import type { World } from '../world/world';

export const REACH = 5.0;

/** Crops are walk-through but still click-targetable (harvesting). */
const isTargetable = (id: number): boolean => SOLID[id] === 1 || isCrop(id);
/** Buckets scoop water, so their ray stops at a water source too. */
const isWaterOrSolid = (id: number): boolean => id === Block.water || SOLID[id] === 1;

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
  /** Right-click a bed to sleep / set respawn. */
  onUseBed: ((x: number, y: number, z: number) => boolean) | null = null;
  /** Throw the held throwing-stone from the eye along (dx,dy,dz). */
  onThrow: ((ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) => void) | null = null;
  /** Block placed/broken at a world cell, for container bookkeeping. */
  onBlockChanged: ((kind: 'place' | 'break', id: number, x: number, y: number, z: number) => void) | null = null;
  /** Survival hold-to-break progress, 0..1 (for the HUD bar). */
  breakProgress = 0;
  private breakX = Number.NaN;
  private breakY = Number.NaN;
  private breakZ = Number.NaN;
  private readonly outline: THREE.LineSegments;
  /** Reddish box drawn around the entity under the crosshair. */
  private readonly entityOutline: THREE.LineSegments;
  private readonly clicks: number[] = [];

  constructor(scene: THREE.Scene) {
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
      new THREE.LineBasicMaterial({ color: 0x101010 }),
    );
    this.outline.visible = false;
    scene.add(this.outline);
    this.entityOutline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0x8a2020 }),
    );
    this.entityOutline.visible = false;
    scene.add(this.entityOutline);
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

    // Aim feedback: if a creature is nearer along the ray than the block,
    // outline the creature instead of the block.
    const animalAim = this.animals?.raycastNearest(body.x, eyeY, body.z, dirX, dirY, dirZ, REACH) ?? null;
    const hostileAim = this.hostiles?.raycastNearest(body.x, eyeY, body.z, dirX, dirY, dirZ, REACH) ?? null;
    const aimHostile = hostileAim !== null && (animalAim === null || hostileAim.distance <= animalAim.distance);
    const aimDist = aimHostile ? hostileAim?.distance : animalAim?.distance;
    const entityAimed = aimDist !== undefined && (!this.hasTarget || aimDist < this.hit.distance);
    if (entityAimed) {
      const aimBody = aimHostile && hostileAim ? hostileAim.stalker.body : animalAim?.animal.body;
      const hw = aimHostile ? STALKER_HALF_WIDTH : ANIMAL_HALF_WIDTH;
      const h = aimHostile ? STALKER_HEIGHT : ANIMAL_HEIGHT;
      if (aimBody) {
        this.entityOutline.visible = true;
        this.entityOutline.position.set(aimBody.x, aimBody.y + h / 2, aimBody.z);
        this.entityOutline.scale.set(hw * 2 + 0.08, h + 0.08, hw * 2 + 0.08);
      }
    } else {
      this.entityOutline.visible = false;
    }

    if (this.hasTarget && !entityAimed) {
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
          if (this.tryUseBed(world)) continue;
          if (this.tryOpenContainer(world)) continue;
          if (this.tryUseBucket(world, hotbar, body.x, eyeY, body.z, dirX, dirY, dirZ)) continue;
          if (this.tryFarm(world, hotbar)) continue;
          if (this.tryEat(player, hotbar)) continue;
          if (this.tryThrow(hotbar, body.x, eyeY, body.z, dirX, dirY, dirZ)) continue;
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
          if (this.tryUseBed(world)) continue;
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

  /** Right-click a bed: hand off to the sleep / set-respawn hook. */
  private tryUseBed(world: World): boolean {
    if (!this.hasTarget || !this.onUseBed) return false;
    const { bx, by, bz } = this.hit;
    if (world.getBlock(bx, by, bz) !== Block.bed) return false;
    return this.onUseBed(bx, by, bz);
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
      this.hostiles?.hurt(hostileHit.stalker, dx, dz);
    } else if (animalHit) {
      const drops = this.animals?.hurt(animalHit.animal, dx, dz) ?? null;
      if (drops && inventory) inventory.add(drops.id, drops.count);
    }
    this.onEdit?.('break', Item.meat); // thud
    return true;
  }

  /** Hoe tills grass/dirt into farmland; seeds plant a sprout above farmland. */
  private tryFarm(world: World, hotbar: HotbarState): boolean {
    const inventory = hotbar.inventory;
    const stack = inventory?.slots[hotbar.slot];
    if (!inventory || !stack || !this.hasTarget) return false;
    const { bx, by, bz } = this.hit;
    const targetId = world.getBlock(bx, by, bz);
    const aboveId = world.getBlock(bx, by + 1, bz);
    const tilled = tillResult(stack.id, targetId);
    if (tilled !== null && aboveId === Block.air) {
      world.setBlock(bx, by, bz, tilled);
      this.onEdit?.('place', tilled);
      return true;
    }
    const planted = plantResult(stack.id, targetId, aboveId);
    if (planted !== null) {
      if (!inventory.consumeOne(hotbar.slot)) return false;
      world.setBlock(bx, by + 1, bz, planted);
      this.onEdit?.('place', planted);
      return true;
    }
    return false;
  }

  /** Crops can't float: breaking their support pops them (seeds in survival). */
  private popCropAbove(world: World, bx: number, by: number, bz: number, inventory: Inventory | null): void {
    const above = world.getBlock(bx, by + 1, bz);
    if (!isCrop(above)) return;
    world.setBlock(bx, by + 1, bz, Block.air);
    if (inventory) {
      const drop = dropFor(above, 0);
      if (drop) inventory.add(drop.id, drop.count);
    }
  }

  /** Holding food: right-click eats it when hungry. Returns true if consumed. */
  private tryEat(player: PlayerController, hotbar: HotbarState): boolean {
    const inventory = hotbar.inventory;
    const stack = inventory?.slots[hotbar.slot];
    if (!inventory || !stack || !isFood(stack.id)) return false;
    if (player.hunger >= MAX_HUNGER) return false;
    if (!inventory.consumeOne(hotbar.slot)) return false;
    player.eat(foodValue(stack.id));
    this.onEdit?.('place', stack.id);
    return true;
  }

  /** Hurl the held throwing stone along the view ray, consuming one. */
  private tryThrow(
    hotbar: HotbarState,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
  ): boolean {
    const inventory = hotbar.inventory;
    const stack = inventory?.slots[hotbar.slot];
    if (!inventory || !stack || !isThrowable(stack.id) || !this.onThrow) return false;
    if (!inventory.consumeOne(hotbar.slot)) return false;
    // Launch just ahead of the eye so it never collides with the player cell.
    this.onThrow(ox + dx * 0.6, oy + dy * 0.6, oz + dz * 0.6, dx, dy, dz);
    this.onEdit?.('break', stack.id);
    return true;
  }

  private readonly bucketHit: RaycastHit = { bx: 0, by: 0, bz: 0, nx: 0, ny: 0, nz: 0, distance: 0 };

  /**
   * Empty bucket scoops a water source along the view ray; a full bucket pours
   * into the air cell against the targeted block. Buckets are unstackable, so
   * the held stack's id is simply swapped in place.
   */
  private tryUseBucket(
    world: World,
    hotbar: HotbarState,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
  ): boolean {
    const inventory = hotbar.inventory;
    const stack = inventory?.slots[hotbar.slot];
    if (!inventory || !stack) return false;

    if (stack.id === Item.bucket) {
      if (!raycast(world.blockAt, isWaterOrSolid, ox, oy, oz, dx, dy, dz, REACH, this.bucketHit)) return false;
      const { bx, by, bz } = this.bucketHit;
      const r = useBucketOn(stack.id, world.getBlock(bx, by, bz));
      if (!r) return false;
      world.setBlock(bx, by, bz, r.setCell);
      stack.id = r.newHeld;
      inventory.version++;
      this.onEdit?.('break', Item.bucket);
      return true;
    }

    if (stack.id === Item.waterBucket && this.hasTarget) {
      const bx = this.hit.bx + this.hit.nx;
      const by = this.hit.by + this.hit.ny;
      const bz = this.hit.bz + this.hit.nz;
      const r = useBucketOn(stack.id, world.getBlock(bx, by, bz));
      if (!r) return false;
      world.setBlock(bx, by, bz, r.setCell);
      stack.id = r.newHeld;
      inventory.version++;
      this.onEdit?.('place', Block.water);
      return true;
    }
    return false;
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
      const bonus = bonusDropFor(id, Math.random());
      if (bonus) inventory.add(bonus.id, bonus.count);
      this.popCropAbove(world, bx, by, bz, inventory);
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
    this.popCropAbove(world, bx, by, bz, null);
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
    if (!inventory || !stack) return;
    // Saplings aren't blocks: plant a tree on top of grass instead.
    if (stack.id === Item.sapling) {
      this.trySurvivalPlantSapling(world, hotbar);
      return;
    }
    if (!isBlockId(stack.id)) return;
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

  /** Plant a sapling: grow a tree above a grass block, consuming the item. */
  private trySurvivalPlantSapling(world: World, hotbar: HotbarState): void {
    const inventory = hotbar.inventory;
    if (!inventory) return;
    // Must target the top face of a grass block with air above it.
    if (this.hit.ny !== 1 || world.getBlock(this.hit.bx, this.hit.by, this.hit.bz) !== Block.grass) return;
    const bx = this.hit.bx;
    const by = this.hit.by + 1;
    const bz = this.hit.bz;
    if (world.getBlock(bx, by, bz) !== Block.air) return;
    if (!inventory.consumeOne(hotbar.slot)) return;
    growTree(world, bx, by, bz);
    this.onEdit?.('place', Block.log);
  }
}

/** Grow a tree into the air above a planted spot (never destroys blocks). */
export function growTree(world: World, bx: number, by: number, bz: number, trunkHeight = 5): void {
  // The base block (the grass) is at by-1; tree offsets are dy>=1 from it.
  forEachTreeBlock(trunkHeight, (dx, dy, dz, id) => {
    const tx = bx + dx;
    const ty = by - 1 + dy;
    const tz = bz + dz;
    if (world.getBlock(tx, ty, tz) === Block.air) world.setBlock(tx, ty, tz, id);
  });
}
