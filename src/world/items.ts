/**
 * Item registry: ids below 100 are blocks (placeable), 100+ are items
 * (tools/materials). Also home to the survival mining rules — drop tables,
 * ore tiers and tool-adjusted break times — kept pure for testing.
 */
import { Block, BREAK_TIME, FACE_TILES } from './blocks';
import { Tiles } from '../engine/atlas';

export const Item = {
  stick: 100,
  woodPickaxe: 101,
  stonePickaxe: 102,
  ironPickaxe: 103,
  meat: 104,
  charcoal: 105,
  ingot: 106, // iron ingot
  coal: 107,
  copperIngot: 108,
  goldIngot: 109,
  copperPickaxe: 110,
  goldPickaxe: 111,
} as const;

/** Hunger restored when eating meat (RMB while holding it). */
export const MEAT_FOOD = 6;

export const MAX_STACK = 64;

const PICKAXES = new Set<number>([
  Item.woodPickaxe,
  Item.stonePickaxe,
  Item.copperPickaxe,
  Item.ironPickaxe,
  Item.goldPickaxe,
]);

export function isBlockId(id: number): boolean {
  return id > 0 && id < 100;
}

export function isToolId(id: number): boolean {
  return PICKAXES.has(id);
}

export function stackLimit(id: number): number {
  return isToolId(id) ? 1 : MAX_STACK;
}

const ITEM_TILE: Record<number, number> = {
  [Item.stick]: Tiles.stick,
  [Item.woodPickaxe]: Tiles.woodPickaxe,
  [Item.stonePickaxe]: Tiles.stonePickaxe,
  [Item.ironPickaxe]: Tiles.ironPickaxe,
  [Item.meat]: Tiles.meat,
  [Item.charcoal]: Tiles.charcoal,
  [Item.ingot]: Tiles.ingot,
  [Item.coal]: Tiles.coal,
  [Item.copperIngot]: Tiles.copperIngot,
  [Item.goldIngot]: Tiles.goldIngot,
  [Item.copperPickaxe]: Tiles.copperPickaxe,
  [Item.goldPickaxe]: Tiles.goldPickaxe,
};

/** Atlas tile for any id (block side tile or item tile). */
export function iconTileFor(id: number): number {
  if (isBlockId(id)) return FACE_TILES[id * 6] ?? 0;
  return ITEM_TILE[id] ?? 0;
}

const ITEM_NAME: Record<number, string> = {
  [Item.stick]: 'stick',
  [Item.woodPickaxe]: 'wood pickaxe',
  [Item.stonePickaxe]: 'stone pickaxe',
  [Item.ironPickaxe]: 'iron pickaxe',
  [Item.meat]: 'meat',
  [Item.charcoal]: 'charcoal',
  [Item.ingot]: 'iron ingot',
  [Item.coal]: 'coal',
  [Item.copperIngot]: 'copper ingot',
  [Item.goldIngot]: 'gold ingot',
  [Item.copperPickaxe]: 'copper pickaxe',
  [Item.goldPickaxe]: 'gold pickaxe',
};

export function itemName(id: number): string {
  return ITEM_NAME[id] ?? `item ${id}`;
}

/** Pickaxe tier of a held item: 0 none, 1 wood, 2 stone, 3 copper, 4 iron, 5 gold. */
export function pickaxeTier(heldId: number): number {
  switch (heldId) {
    case Item.woodPickaxe:
      return 1;
    case Item.stonePickaxe:
      return 2;
    case Item.copperPickaxe:
      return 3;
    case Item.ironPickaxe:
      return 4;
    case Item.goldPickaxe:
      return 5;
    default:
      return 0;
  }
}

/** Mining-speed multiplier by tier (gold is fast but soft — a luxury tool). */
const TIER_SPEED = [1, 2, 4, 5, 6, 9] as const;
const ORE_WRONG_TOOL_PENALTY = 5;

interface OreInfo {
  /** What the ore yields once the tool requirement is met. */
  readonly drop: { id: number; count: number };
  /** Minimum pickaxe tier to mine a drop. */
  readonly requiredTier: number;
}

/** Ore blocks → drop + tier gate. Iron/copper/gold drop the block (smeltable). */
export const ORES: ReadonlyMap<number, OreInfo> = new Map<number, OreInfo>([
  [Block.coalOre, { drop: { id: Item.coal, count: 1 }, requiredTier: 1 }],
  [Block.ore, { drop: { id: Block.ore, count: 1 }, requiredTier: 2 }],
  [Block.copperOre, { drop: { id: Block.copperOre, count: 1 }, requiredTier: 2 }],
  [Block.goldOre, { drop: { id: Block.goldOre, count: 1 }, requiredTier: 4 }],
]);

/** Stone-family blocks a pickaxe speeds up (no tier gate, just faster). */
const PICK_SPEEDABLE = new Set<number>([Block.stone, Block.cobblestone, Block.brick]);

/**
 * Survival break time for a block given the held item. Ores mined with too
 * weak a pickaxe are punishingly slow (and yield nothing — see dropFor).
 */
export function breakSecondsFor(blockId: number, heldId: number): number {
  const base = BREAK_TIME[blockId] ?? Infinity;
  if (!Number.isFinite(base) || base <= 0) return Infinity;
  const tier = pickaxeTier(heldId);
  const ore = ORES.get(blockId);
  if (ore) {
    if (tier < ore.requiredTier) return base * ORE_WRONG_TOOL_PENALTY;
    return base / (TIER_SPEED[tier] ?? 1);
  }
  if (PICK_SPEEDABLE.has(blockId)) return base / (TIER_SPEED[tier] ?? 1);
  return base;
}

/**
 * What breaking a block yields in survival (null = nothing). Stone crumbles
 * to cobblestone; grass turns up dirt; leaves drop nothing; ores need the
 * right tool tier; everything else drops itself.
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
    default:
      break;
  }
  const ore = ORES.get(blockId);
  if (ore) return pickaxeTier(heldId) >= ore.requiredTier ? { ...ore.drop } : null;
  return { id: blockId, count: 1 };
}
