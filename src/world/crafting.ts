/**
 * Crafting: a compact original recipe list driven by ingredient counts (the
 * inventory screen renders it as a click-to-craft recipe book). Pure.
 */
import { Block } from './blocks';
import { Item } from './items';
import type { Inventory } from '../player/inventory';

export interface Recipe {
  readonly name: string;
  readonly output: number;
  readonly outputCount: number;
  readonly inputs: ReadonlyArray<{ id: number; count: number }>;
}

export const RECIPES: readonly Recipe[] = [
  { name: 'planks', output: Block.planks, outputCount: 4, inputs: [{ id: Block.log, count: 1 }] },
  { name: 'sticks', output: Item.stick, outputCount: 4, inputs: [{ id: Block.planks, count: 2 }] },
  {
    name: 'wood pickaxe',
    output: Item.woodPickaxe,
    outputCount: 1,
    inputs: [
      { id: Block.planks, count: 3 },
      { id: Item.stick, count: 2 },
    ],
  },
  {
    name: 'stone pickaxe',
    output: Item.stonePickaxe,
    outputCount: 1,
    inputs: [
      { id: Block.cobblestone, count: 3 },
      { id: Item.stick, count: 2 },
    ],
  },
  {
    name: 'iron pickaxe',
    output: Item.ironPickaxe,
    outputCount: 1,
    inputs: [
      { id: Block.ore, count: 3 },
      { id: Item.stick, count: 2 },
    ],
  },
  { name: 'bricks', output: Block.brick, outputCount: 4, inputs: [{ id: Block.cobblestone, count: 4 }] },
  { name: 'glass', output: Block.glass, outputCount: 4, inputs: [{ id: Block.sand, count: 4 }] },
];

/** How many times the recipe could be crafted from this inventory. */
export function craftableCount(inventory: Inventory, recipe: Recipe): number {
  let times = Infinity;
  for (const input of recipe.inputs) {
    times = Math.min(times, Math.floor(inventory.countOf(input.id) / input.count));
  }
  return Number.isFinite(times) ? times : 0;
}

/**
 * Craft once: consume inputs, add output. Returns false (with inventory
 * untouched) if ingredients or output space are missing.
 */
export function craft(inventory: Inventory, recipe: Recipe): boolean {
  if (craftableCount(inventory, recipe) < 1) return false;
  for (const input of recipe.inputs) inventory.remove(input.id, input.count);
  const leftover = inventory.add(recipe.output, recipe.outputCount);
  if (leftover > 0) {
    // No room: refund everything (rare; keeps the operation atomic).
    inventory.remove(recipe.output, recipe.outputCount - leftover);
    for (const input of recipe.inputs) inventory.add(input.id, input.count);
    return false;
  }
  return true;
}
