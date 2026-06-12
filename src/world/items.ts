/**
 * Item registry: ids below 100 are blocks (placeable), 100+ are items
 * (tools/materials). Also home to the survival mining rules — drop tables
 * and tool-adjusted break times — kept pure for testing.
 */
import { Block, BREAK_TIME, FACE_TILES } from './blocks';
import { Tiles } from '../engine/atlas';

export const Item = {
  stick: 100,
  woodPickaxe: 101,
  stonePickaxe: 102,
  ironPickaxe: 103,
} as const;

export const MAX_STACK = 64;

export function isBlockId(id: number): boolean {
  return id > 0 && id < 100;
}

export function isToolId(id: number): boolean {
  return id >= Item.woodPickaxe && id <= Item.ironPickaxe;
}

export function stackLimit(id: number): number {
  return isToolId(id) ? 1 : MAX_STACK;
}

/** Atlas tile for any id (block side tile or item tile). */
export function iconTileFor(id: number): number {
  if (isBlockId(id)) return FACE_TILES[id * 6] ?? 0;
  switch (id) {
    case Item.stick:
      return Tiles.stick;
    case Item.woodPickaxe:
      return Tiles.woodPickaxe;
    case Item.stonePickaxe:
      return Tiles.stonePickaxe;
    case Item.ironPickaxe:
      return Tiles.ironPickaxe;
    default:
      return 0;
  }
}

export function itemName(id: number): string {
  switch (id) {
    case Item.stick:
      return 'stick';
    case Item.woodPickaxe:
      return 'wood pickaxe';
    case Item.stonePickaxe:
      return 'stone pickaxe';
    case Item.ironPickaxe:
      return 'iron pickaxe';
    default:
      return `item ${id}`;
  }
}

/** Pickaxe tier of a held item: 0 none, 1 wood, 2 stone, 3 iron. */
export function pickaxeTier(heldId: number): number {
  switch (heldId) {
    case Item.woodPickaxe:
      return 1;
    case Item.stonePickaxe:
      return 2;
    case Item.ironPickaxe:
      return 3;
    default:
      return 0;
  }
}

/** Blocks that a pickaxe meaningfully speeds up. */
const PICK_CLASS = new Set<number>([Block.stone, Block.cobblestone, Block.brick, Block.ore]);

const TIER_SPEED = [1, 2, 4, 6] as const;
const ORE_BAREHAND_PENALTY = 5;

/**
 * Survival break time for a block given the held item. Ore without a
 * pickaxe is painfully slow (and drops nothing — see dropFor).
 */
export function breakSecondsFor(blockId: number, heldId: number): number {
  const base = BREAK_TIME[blockId] ?? Infinity;
  if (!Number.isFinite(base) || base <= 0) return Infinity;
  if (!PICK_CLASS.has(blockId)) return base;
  const tier = pickaxeTier(heldId);
  if (blockId === Block.ore && tier === 0) return base * ORE_BAREHAND_PENALTY;
  return base / (TIER_SPEED[tier] ?? 1);
}

/**
 * What breaking a block yields in survival (null = nothing). Stone crumbles
 * to cobblestone; grass turns up dirt; leaves and ore-without-pickaxe drop
 * nothing; everything else drops itself.
 */
export function dropFor(blockId: number, heldId: number): { id: number; count: number } | null {
  switch (blockId) {
    case Block.air:
    case Block.water:
    case Block.bedrock:
    case Block.leaves:
      return null;
    case Block.stone:
      return { id: Block.cobblestone, count: 1 };
    case Block.grass:
      return { id: Block.dirt, count: 1 };
    case Block.ore:
      return pickaxeTier(heldId) >= 1 ? { id: Block.ore, count: 1 } : null;
    default:
      return { id: blockId, count: 1 };
  }
}
