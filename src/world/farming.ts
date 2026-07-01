/**
 * Farming: a hoe tills grass/dirt into farmland, seeds planted on farmland
 * become a sprout, and random column ticks around the player walk each crop
 * through growing → ripe. The growth stage IS the block id, so fields persist
 * with the chunk bytes and need no side tables. Rules are pure; the ticker
 * takes an injected RNG so tests are deterministic.
 */
import { Block } from './blocks';
import { Item } from './items';
import { CHUNK_HEIGHT } from './chunk';

/** Hoe on grass or dirt tills it into farmland (null = not tillable). */
export function tillResult(heldId: number, targetId: number): number | null {
  if (heldId !== Item.hoe) return null;
  return targetId === Block.grass || targetId === Block.dirt ? Block.farmland : null;
}

/** Seeds on farmland with air above plant a sprout in the cell above. */
export function plantResult(heldId: number, targetId: number, aboveId: number): number | null {
  if (heldId !== Item.seeds) return null;
  return targetId === Block.farmland && aboveId === Block.air ? Block.cropSprout : null;
}

export function isCrop(id: number): boolean {
  return id === Block.cropSprout || id === Block.cropGrowing || id === Block.cropRipe;
}

/** The next growth stage for a crop block (null when ripe / not a crop). */
export function nextCropStage(id: number): number | null {
  if (id === Block.cropSprout) return Block.cropGrowing;
  if (id === Block.cropGrowing) return Block.cropRipe;
  return null;
}

export interface GrowthWorld {
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: number): void;
}

export const GROWTH_TICK_SECONDS = 1;
/** Columns sampled per tick within GROWTH_RADIUS of the player. */
export const GROWTH_SAMPLES = 64;
export const GROWTH_RADIUS = 24;
/** Chance a sampled crop advances one stage — near fields ripen in ~1-2 min. */
export const GROW_CHANCE = 0.55;

/** Random-tick crop growth driver, sampling columns around the player. */
export class CropGrowth {
  private pending = 0;

  constructor(private readonly random: () => number = Math.random) {}

  fixedUpdate(dt: number, world: GrowthWorld, px: number, pz: number): void {
    this.pending += dt;
    while (this.pending >= GROWTH_TICK_SECONDS) {
      this.pending -= GROWTH_TICK_SECONDS;
      this.tick(world, px, pz);
    }
  }

  private tick(world: GrowthWorld, px: number, pz: number): void {
    for (let i = 0; i < GROWTH_SAMPLES; i++) {
      const x = Math.floor(px + (this.random() * 2 - 1) * GROWTH_RADIUS);
      const z = Math.floor(pz + (this.random() * 2 - 1) * GROWTH_RADIUS);
      for (let y = 1; y < CHUNK_HEIGHT; y++) {
        const next = nextCropStage(world.getBlock(x, y, z));
        if (next === null) continue;
        if (this.random() < GROW_CHANCE) world.setBlock(x, y, z, next);
      }
    }
  }
}
