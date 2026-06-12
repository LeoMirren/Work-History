/**
 * Crafting & smelting — an original recipe set driven by ingredient counts.
 * The inventory screen renders these as a click-to-make book. Pure.
 *
 * Two stations:
 *  - 'craft' recipes are always available;
 *  - 'smelt' recipes need a furnace within reach AND one fuel item, which is
 *    consumed per smelt (fuel preference: charcoal is produced, so raw wood
 *    burns first).
 */
import { Block } from './blocks';
import { Item } from './items';
import type { Inventory } from '../player/inventory';

export type Station = 'craft' | 'smelt';

export interface Recipe {
  readonly name: string;
  readonly station: Station;
  readonly output: number;
  readonly outputCount: number;
  readonly inputs: ReadonlyArray<{ id: number; count: number }>;
}

/** Items accepted as furnace fuel, cheapest/most-abundant burned first. */
export const FUEL_IDS: readonly number[] = [Block.log, Block.planks, Item.charcoal];

export const RECIPES: readonly Recipe[] = [
  { name: 'planks', station: 'craft', output: Block.planks, outputCount: 4, inputs: [{ id: Block.log, count: 1 }] },
  { name: 'sticks', station: 'craft', output: Item.stick, outputCount: 4, inputs: [{ id: Block.planks, count: 2 }] },
  {
    name: 'wood pickaxe',
    station: 'craft',
    output: Item.woodPickaxe,
    outputCount: 1,
    inputs: [
      { id: Block.planks, count: 3 },
      { id: Item.stick, count: 2 },
    ],
  },
  {
    name: 'stone pickaxe',
    station: 'craft',
    output: Item.stonePickaxe,
    outputCount: 1,
    inputs: [
      { id: Block.cobblestone, count: 3 },
      { id: Item.stick, count: 2 },
    ],
  },
  {
    name: 'iron pickaxe',
    station: 'craft',
    output: Item.ironPickaxe,
    outputCount: 1,
    inputs: [
      { id: Item.ingot, count: 3 },
      { id: Item.stick, count: 2 },
    ],
  },
  { name: 'furnace', station: 'craft', output: Block.furnace, outputCount: 1, inputs: [{ id: Block.cobblestone, count: 8 }] },
  { name: 'chest', station: 'craft', output: Block.chest, outputCount: 1, inputs: [{ id: Block.planks, count: 8 }] },
  { name: 'bricks', station: 'craft', output: Block.brick, outputCount: 4, inputs: [{ id: Block.cobblestone, count: 4 }] },
  // Smelting (furnace + fuel).
  { name: 'iron ingot', station: 'smelt', output: Item.ingot, outputCount: 1, inputs: [{ id: Block.ore, count: 1 }] },
  { name: 'charcoal', station: 'smelt', output: Item.charcoal, outputCount: 1, inputs: [{ id: Block.log, count: 1 }] },
  { name: 'glass', station: 'smelt', output: Block.glass, outputCount: 1, inputs: [{ id: Block.sand, count: 1 }] },
];

/** Total units of an id the inputs demand (handles repeats defensively). */
function inputNeed(recipe: Recipe, id: number): number {
  let n = 0;
  for (const input of recipe.inputs) if (input.id === id) n += input.count;
  return n;
}

/**
 * Pick a fuel id the inventory can spare for one smelt, accounting for any
 * fuel that is also a recipe input (needs input+1 of that id). Returns null
 * if no fuel works.
 */
function chooseFuel(inventory: Inventory, recipe: Recipe): number | null {
  for (const fuel of FUEL_IDS) {
    if (inventory.countOf(fuel) >= inputNeed(recipe, fuel) + 1) return fuel;
  }
  return null;
}

export interface MakeContext {
  /** A furnace block is within reach (required for 'smelt'). */
  furnaceAvailable: boolean;
}

/** Can this recipe be made once right now? */
export function canMake(inventory: Inventory, recipe: Recipe, ctx: MakeContext): boolean {
  for (const input of recipe.inputs) {
    if (inventory.countOf(input.id) < input.count) return false;
  }
  if (recipe.station === 'smelt') {
    if (!ctx.furnaceAvailable) return false;
    if (chooseFuel(inventory, recipe) === null) return false;
  }
  return true;
}

/** Conservative count of how many times the recipe could be made. */
export function craftableCount(inventory: Inventory, recipe: Recipe, ctx: MakeContext): number {
  if (recipe.station === 'smelt' && !ctx.furnaceAvailable) return 0;
  let times = Infinity;
  for (const input of recipe.inputs) {
    times = Math.min(times, Math.floor(inventory.countOf(input.id) / input.count));
  }
  if (recipe.station === 'smelt') {
    let fuelPool = 0;
    for (const fuel of FUEL_IDS) fuelPool += inventory.countOf(fuel);
    times = Math.min(times, fuelPool);
  }
  return Number.isFinite(times) ? Math.max(0, times) : 0;
}

/**
 * Make one: consume inputs (and one fuel for smelting), add the output.
 * Atomic — refunds everything and returns false if it can't complete.
 */
export function craft(inventory: Inventory, recipe: Recipe, ctx: MakeContext = { furnaceAvailable: true }): boolean {
  if (!canMake(inventory, recipe, ctx)) return false;
  const fuel = recipe.station === 'smelt' ? chooseFuel(inventory, recipe) : null;
  if (recipe.station === 'smelt' && fuel === null) return false;

  for (const input of recipe.inputs) inventory.remove(input.id, input.count);
  if (fuel !== null) inventory.remove(fuel, 1);

  const leftover = inventory.add(recipe.output, recipe.outputCount);
  if (leftover > 0) {
    // No room: refund everything (keeps the operation atomic).
    inventory.remove(recipe.output, recipe.outputCount - leftover);
    for (const input of recipe.inputs) inventory.add(input.id, input.count);
    if (fuel !== null) inventory.add(fuel, 1);
    return false;
  }
  return true;
}
