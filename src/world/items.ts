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
  gem: 112,
  gemPickaxe: 113,
  sapling: 114,
  cookedMeat: 115,
  ironVest: 116,
  goldVest: 117,
  gemVest: 118,
  throwingStone: 119,
  bucket: 120,
  waterBucket: 121,
  seeds: 122,
  grain: 123,
  bread: 124,
  hoe: 125,
  // Deep-boss summon and its reward tier.
  sovereignTotem: 126,
  kingsplitter: 127, // the Sunken King's greataxe: apex melee weapon
  crown: 128, // trophy of the fallen king
  // The Stone Colossus' hoard.
  titanHeart: 129, // trophy of the felled titan
  earthshaker: 130, // the Colossus' maul: heaviest blow in the game, apex mining
  // Deep-metal chains: silver (armor/economy) and dusksteel (blades), plus
  // ember shards mined from the underworld's burning seams.
  silverIngot: 131,
  duskIngot: 132,
  emberShard: 133,
  silverVest: 134,
  duskVest: 135,
  duskblade: 136, // craftable apex blade (boss weapons still hit harder)
  // The Hollow Tyrant's boost hoard.
  tyrantEye: 137, // trophy of the slain Tyrant
  heartstone: 138, // U: +1 heart of max health, permanently
  // The Ashen Monarch's hoard — the end of the game.
  nightsever: 139, // THE weapon: 100 damage, one-shots everything that walks
  ashcrown: 140, // trophy of the fallen Monarch
  // Late-game kitchen.
  heartyStew: 141, // cooked meat + grain, the best campfire meal
  goldenLoaf: 142, // bread baked with gold — decadent, and it shows
} as const;

/**
 * What a bucket does when used on a cell (pure). Empty bucket scoops a water
 * source; a full bucket pours into an empty cell. Returns the cell's new block
 * id and the bucket's new item id, or null if the action doesn't apply.
 */
export function useBucketOn(
  heldId: number,
  cellId: number,
): { setCell: number; newHeld: number } | null {
  if (heldId === Item.bucket && cellId === Block.water) {
    return { setCell: Block.air, newHeld: Item.waterBucket };
  }
  if (heldId === Item.waterBucket && cellId === Block.air) {
    return { setCell: Block.water, newHeld: Item.bucket };
  }
  return null;
}

/** Damage a thrown stone deals to a mob on a direct hit. */
export const THROW_DAMAGE = 3;

export function isThrowable(id: number): boolean {
  return id === Item.throwingStone;
}

/** Fraction of incoming damage a worn vest absorbs (capped well under 1). */
const ARMOR_REDUCTION: Record<number, number> = {
  [Item.ironVest]: 0.35,
  [Item.goldVest]: 0.5,
  [Item.silverVest]: 0.6,
  [Item.gemVest]: 0.7,
  [Item.duskVest]: 0.78,
};

export function isArmor(id: number): boolean {
  return id in ARMOR_REDUCTION;
}

/** Damage-reduction fraction (0..0.7) for a worn item; 0 if not armor. */
export function armorReductionOf(id: number): number {
  return ARMOR_REDUCTION[id] ?? 0;
}

/** Apply a worn vest's reduction to raw damage; always leaves ≥1 if hit. */
export function mitigatedDamage(raw: number, armorId: number): number {
  if (raw <= 0) return 0;
  return Math.max(1, Math.round(raw * (1 - armorReductionOf(armorId))));
}

/** Hunger restored per edible (RMB while holding it). */
export const MEAT_FOOD = 6;
const FOOD: Record<number, number> = {
  [Item.meat]: MEAT_FOOD,
  [Item.cookedMeat]: 10, // cooking nearly doubles the value
  [Item.bread]: 8, // farmed staple: renewable, no hunting required
  [Item.heartyStew]: 14, // the kitchen chain's reward
  [Item.goldenLoaf]: 16, // decadence itself
};

export function isFood(id: number): boolean {
  return id in FOOD;
}

export function foodValue(id: number): number {
  return FOOD[id] ?? 0;
}

export const MAX_STACK = 64;

/** Every obtainable item id, in registry order — the creative catalogue. */
export const PICKER_ITEMS: readonly number[] = Object.values(Item);

const PICKAXES = new Set<number>([
  Item.woodPickaxe,
  Item.stonePickaxe,
  Item.copperPickaxe,
  Item.ironPickaxe,
  Item.goldPickaxe,
  Item.gemPickaxe,
  Item.kingsplitter, // the king's greataxe also mines at the apex tier
  Item.earthshaker, // the titan's maul: same apex tier, heavier swing
  Item.nightsever, // the Monarch's blade: apex tier, and THE weapon
]);

export function isBlockId(id: number): boolean {
  return id > 0 && id < 100;
}

export function isToolId(id: number): boolean {
  return PICKAXES.has(id);
}

const SINGLE = new Set<number>([Item.bucket, Item.waterBucket, Item.hoe, Item.sovereignTotem, Item.crown, Item.titanHeart, Item.tyrantEye, Item.ashcrown]);

export function stackLimit(id: number): number {
  return isToolId(id) || SINGLE.has(id) ? 1 : MAX_STACK;
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
  [Item.gem]: Tiles.gem,
  [Item.gemPickaxe]: Tiles.gemPickaxe,
  [Item.sapling]: Tiles.sapling,
  [Item.cookedMeat]: Tiles.cookedMeat,
  [Item.ironVest]: Tiles.ironVest,
  [Item.goldVest]: Tiles.goldVest,
  [Item.gemVest]: Tiles.gemVest,
  [Item.throwingStone]: Tiles.throwingStone,
  [Item.bucket]: Tiles.bucket,
  [Item.waterBucket]: Tiles.waterBucket,
  [Item.seeds]: Tiles.seeds,
  [Item.grain]: Tiles.grain,
  [Item.bread]: Tiles.bread,
  [Item.hoe]: Tiles.hoe,
  [Item.sovereignTotem]: Tiles.sovereignTotem,
  [Item.kingsplitter]: Tiles.kingsplitter,
  [Item.crown]: Tiles.crown,
  [Item.titanHeart]: Tiles.titanHeart,
  [Item.earthshaker]: Tiles.earthshaker,
  [Item.silverIngot]: Tiles.silverIngot,
  [Item.duskIngot]: Tiles.duskIngot,
  [Item.emberShard]: Tiles.emberShard,
  [Item.silverVest]: Tiles.silverVest,
  [Item.duskVest]: Tiles.duskVest,
  [Item.duskblade]: Tiles.duskblade,
  [Item.tyrantEye]: Tiles.tyrantEye,
  [Item.heartstone]: Tiles.heartstone,
  [Item.nightsever]: Tiles.nightsever,
  [Item.ashcrown]: Tiles.ashcrown,
  [Item.heartyStew]: Tiles.heartyStew,
  [Item.goldenLoaf]: Tiles.goldenLoaf,
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
  [Item.gem]: 'gem',
  [Item.gemPickaxe]: 'gem pickaxe',
  [Item.sapling]: 'sapling',
  [Item.cookedMeat]: 'cooked meat',
  [Item.ironVest]: 'iron vest',
  [Item.goldVest]: 'gold vest',
  [Item.gemVest]: 'gem vest',
  [Item.throwingStone]: 'throwing stone',
  [Item.bucket]: 'bucket',
  [Item.waterBucket]: 'water bucket',
  [Item.seeds]: 'seeds',
  [Item.grain]: 'grain',
  [Item.bread]: 'bread',
  [Item.hoe]: 'hoe',
  [Item.sovereignTotem]: 'sovereign totem',
  [Item.kingsplitter]: 'kingsplitter greataxe',
  [Item.crown]: 'sunken crown',
  [Item.titanHeart]: 'titan heart',
  [Item.earthshaker]: 'earthshaker maul',
  [Item.silverIngot]: 'silver ingot',
  [Item.duskIngot]: 'dusksteel ingot',
  [Item.emberShard]: 'ember shard',
  [Item.silverVest]: 'silver vest',
  [Item.duskVest]: 'dusksteel vest',
  [Item.duskblade]: 'duskblade',
  [Item.tyrantEye]: 'tyrant eye',
  [Item.heartstone]: 'heartstone',
  [Item.nightsever]: 'the Nightsever',
  [Item.ashcrown]: 'ash crown',
  [Item.heartyStew]: 'hearty stew',
  [Item.goldenLoaf]: 'golden loaf',
};

export function itemName(id: number): string {
  return ITEM_NAME[id] ?? `item ${id}`;
}

/**
 * One-line "what does this do" hint for the held item, surfaced above the
 * hotbar when the selection changes. Pure so the coverage is testable.
 */
export function usageHintFor(id: number): string {
  if (id <= 0) return 'left-click: punch · E: inventory & crafting';
  if (isFood(id)) return 'right-click: eat';
  if (id === Item.seeds) return 'right-click farmland: plant (till grass with a hoe first)';
  if (id === Item.hoe) return 'right-click grass or dirt: till farmland';
  if (id === Item.sapling) return 'right-click grass: plant a tree';
  if (id === Item.bucket) return 'right-click water: scoop it up';
  if (id === Item.waterBucket) return 'right-click: pour the water out';
  if (isThrowable(id)) return 'right-click: throw';
  if (id === Item.sovereignTotem) return 'U deep underground (y<94): summon the Sunken King';
  if (id === Item.crown) return 'a trophy of the fallen king';
  if (id === Item.titanHeart) return 'a trophy carved from the fallen Colossus';
  if (id === Item.earthshaker) return 'hold a mouse button: the heaviest blow in the game — also mines at the apex tier';
  if (id === Item.duskblade) return 'hold a mouse button: the sharpest craftable blade (12 damage)';
  if (id === Item.tyrantEye) return 'a trophy pried from the Hollow Tyrant';
  if (id === Item.heartstone) return 'U: bind it to your heart — +1 max heart, forever';
  if (id === Item.nightsever) return 'hold a mouse button: 100 damage — nothing that walks survives it';
  if (id === Item.ashcrown) return 'the Monarch is fallen. the realm is yours';
  if (isArmor(id)) return 'open the inventory (E) and drop it into the armor slot';
  if (isToolId(id)) return 'hold a mouse button: mine — fast on stone and ore';
  if (id === Block.bed) return 'right-click: place · right-click a placed bed: sleep & set respawn';
  if (id === Block.riftframe) return 'right-click: place · right-click a placed frame: travel realms';
  if (id === Block.chest) return 'right-click: place · right-click a placed chest: store items';
  if (isBlockId(id)) return 'right-click: place';
  return 'right-click: use';
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
    case Item.gemPickaxe:
      return 6;
    case Item.kingsplitter:
    case Item.earthshaker:
    case Item.nightsever:
      return 7; // apex: mines anything, instantly on soft stone
    default:
      return 0;
  }
}

/** Mining-speed multiplier by tier (gold is fast-but-soft; king's axe is apex). */
const TIER_SPEED = [1, 2, 4, 5, 6, 9, 12, 20] as const;
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
  // Silver runs shallower than gold but wants a copper pick; dusk ore hides
  // in the deepest seams and only yields to a gem pick. Ember ore burns in
  // the underworld's walls and drops its shard directly (no smelting).
  [Block.silverOre, { drop: { id: Block.silverOre, count: 1 }, requiredTier: 3 }],
  [Block.duskOre, { drop: { id: Block.duskOre, count: 1 }, requiredTier: 6 }],
  [Block.emberOre, { drop: { id: Item.emberShard, count: 1 }, requiredTier: 4 }],
  // Geode crystal: needs a stone-tier pickaxe; drops 1-2 gems handled below.
  [Block.crystal, { drop: { id: Item.gem, count: 1 }, requiredTier: 2 }],
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
    case Block.farmland:
      return { id: Block.dirt, count: 1 };
    // Immature crops refund a seed; ripe crops yield grain (+ bonus seeds).
    case Block.cropSprout:
    case Block.cropGrowing:
      return { id: Item.seeds, count: 1 };
    case Block.cropRipe:
      return { id: Item.grain, count: 1 };
    default:
      break;
  }
  const ore = ORES.get(blockId);
  if (ore) return pickaxeTier(heldId) >= ore.requiredTier ? { ...ore.drop } : null;
  return { id: blockId, count: 1 };
}

const SAPLING_DROP_CHANCE = 0.16;
const SEED_DROP_CHANCE = 0.18;

/**
 * Chance-based bonus drop for a broken block, given a 0..1 roll. Leaves
 * occasionally yield a sapling (renewable wood); grass sometimes turns up
 * seeds (the entry to farming); a ripe crop always returns seeds so fields
 * are self-sustaining. Pure: the caller supplies the roll so it's
 * deterministic in tests.
 */
export function bonusDropFor(blockId: number, roll: number): { id: number; count: number } | null {
  if (blockId === Block.leaves && roll < SAPLING_DROP_CHANCE) return { id: Item.sapling, count: 1 };
  if (blockId === Block.grass && roll < SEED_DROP_CHANCE) return { id: Item.seeds, count: 1 };
  if (blockId === Block.cropRipe) return { id: Item.seeds, count: roll < 0.35 ? 2 : 1 };
  return null;
}
