/**
 * Survival update: the recipe book — availability math and atomic crafting.
 */
import { describe, expect, it } from 'vitest';
import { craft, craftableCount, RECIPES } from '../src/world/crafting';
import { Inventory, INVENTORY_SIZE } from '../src/player/inventory';
import { Item } from '../src/world/items';
import { Block } from '../src/world/blocks';

function recipe(name: string) {
  const r = RECIPES.find((r) => r.name === name);
  if (!r) throw new Error(`missing recipe ${name}`);
  return r;
}

describe('crafting', () => {
  it('computes craftable counts from ingredient totals', () => {
    const inv = new Inventory();
    expect(craftableCount(inv, recipe('planks'))).toBe(0);
    inv.add(Block.log, 3);
    expect(craftableCount(inv, recipe('planks'))).toBe(3);
    inv.add(Block.planks, 5);
    expect(craftableCount(inv, recipe('sticks'))).toBe(2);
  });

  it('crafts consume inputs and add outputs', () => {
    const inv = new Inventory();
    inv.add(Block.log, 2);
    expect(craft(inv, recipe('planks'))).toBe(true);
    expect(inv.countOf(Block.log)).toBe(1);
    expect(inv.countOf(Block.planks)).toBe(4);
    expect(craft(inv, recipe('sticks'))).toBe(true);
    expect(inv.countOf(Block.planks)).toBe(2);
    expect(inv.countOf(Item.stick)).toBe(4);
  });

  it('supports the full tool ladder', () => {
    const inv = new Inventory();
    inv.add(Block.planks, 3);
    inv.add(Item.stick, 2);
    expect(craft(inv, recipe('wood pickaxe'))).toBe(true);
    expect(inv.countOf(Item.woodPickaxe)).toBe(1);
    expect(inv.countOf(Block.planks)).toBe(0);
    expect(inv.countOf(Item.stick)).toBe(0);

    inv.add(Block.cobblestone, 3);
    inv.add(Item.stick, 2);
    expect(craft(inv, recipe('stone pickaxe'))).toBe(true);
    expect(inv.countOf(Item.stonePickaxe)).toBe(1);

    inv.add(Block.ore, 3);
    inv.add(Item.stick, 2);
    expect(craft(inv, recipe('iron pickaxe'))).toBe(true);
    expect(inv.countOf(Item.ironPickaxe)).toBe(1);
  });

  it('refuses to craft without ingredients, leaving inventory untouched', () => {
    const inv = new Inventory();
    inv.add(Block.planks, 1);
    expect(craft(inv, recipe('sticks'))).toBe(false);
    expect(inv.countOf(Block.planks)).toBe(1);
  });

  it('is atomic when the output cannot fit', () => {
    const inv = new Inventory();
    // Every slot holds an un-mergeable full stack except the log stack itself.
    for (let i = 0; i < INVENTORY_SIZE; i++) inv.slots[i] = { id: Block.snow, count: 64 };
    inv.slots[0] = { id: Block.log, count: 64 };
    expect(craft(inv, recipe('planks'))).toBe(false);
    expect(inv.countOf(Block.log)).toBe(64); // refunded
    expect(inv.countOf(Block.planks)).toBe(0);
  });
});
