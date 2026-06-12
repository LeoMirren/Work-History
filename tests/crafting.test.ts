/**
 * Recipe book: crafting + smelting availability math and atomic making.
 */
import { describe, expect, it } from 'vitest';
import { canMake, craft, craftableCount, RECIPES } from '../src/world/crafting';
import { Inventory, INVENTORY_SIZE } from '../src/player/inventory';
import { Item } from '../src/world/items';
import { Block } from '../src/world/blocks';

const NO_FURNACE = { furnaceAvailable: false };
const FURNACE = { furnaceAvailable: true };

function recipe(name: string) {
  const r = RECIPES.find((r) => r.name === name);
  if (!r) throw new Error(`missing recipe ${name}`);
  return r;
}

describe('crafting', () => {
  it('computes craftable counts from ingredient totals', () => {
    const inv = new Inventory();
    expect(craftableCount(inv, recipe('planks'), NO_FURNACE)).toBe(0);
    inv.add(Block.log, 3);
    expect(craftableCount(inv, recipe('planks'), NO_FURNACE)).toBe(3);
    inv.add(Block.planks, 5);
    expect(craftableCount(inv, recipe('sticks'), NO_FURNACE)).toBe(2);
  });

  it('crafts consume inputs and add outputs', () => {
    const inv = new Inventory();
    inv.add(Block.log, 2);
    expect(craft(inv, recipe('planks'), NO_FURNACE)).toBe(true);
    expect(inv.countOf(Block.log)).toBe(1);
    expect(inv.countOf(Block.planks)).toBe(4);
    expect(craft(inv, recipe('sticks'), NO_FURNACE)).toBe(true);
    expect(inv.countOf(Block.planks)).toBe(2);
    expect(inv.countOf(Item.stick)).toBe(4);
  });

  it('builds the full tool ladder, ore now routed through smelting', () => {
    const inv = new Inventory();
    inv.add(Block.planks, 3);
    inv.add(Item.stick, 2);
    expect(craft(inv, recipe('wood pickaxe'), NO_FURNACE)).toBe(true);
    expect(inv.countOf(Item.woodPickaxe)).toBe(1);

    inv.add(Block.cobblestone, 3);
    inv.add(Item.stick, 2);
    expect(craft(inv, recipe('stone pickaxe'), NO_FURNACE)).toBe(true);
    expect(inv.countOf(Item.stonePickaxe)).toBe(1);

    // Iron pickaxe now needs ingots, which come from smelting ore.
    inv.add(Item.ingot, 3);
    inv.add(Item.stick, 2);
    expect(craft(inv, recipe('iron pickaxe'), NO_FURNACE)).toBe(true);
    expect(inv.countOf(Item.ironPickaxe)).toBe(1);
  });

  it('crafts a furnace from cobblestone', () => {
    const inv = new Inventory();
    inv.add(Block.cobblestone, 8);
    expect(craft(inv, recipe('furnace'), NO_FURNACE)).toBe(true);
    expect(inv.countOf(Block.furnace)).toBe(1);
    expect(inv.countOf(Block.cobblestone)).toBe(0);
  });

  it('refuses to craft without ingredients, leaving inventory untouched', () => {
    const inv = new Inventory();
    inv.add(Block.planks, 1);
    expect(craft(inv, recipe('sticks'), NO_FURNACE)).toBe(false);
    expect(inv.countOf(Block.planks)).toBe(1);
  });

  it('is atomic when the output cannot fit', () => {
    const inv = new Inventory();
    for (let i = 0; i < INVENTORY_SIZE; i++) inv.slots[i] = { id: Block.snow, count: 64 };
    inv.slots[0] = { id: Block.log, count: 64 };
    expect(craft(inv, recipe('planks'), NO_FURNACE)).toBe(false);
    expect(inv.countOf(Block.log)).toBe(64); // refunded
    expect(inv.countOf(Block.planks)).toBe(0);
  });
});

describe('smelting', () => {
  it('needs a furnace AND fuel to smelt ore into ingots', () => {
    const inv = new Inventory();
    inv.add(Block.ore, 2);
    // No furnace: blocked even with fuel.
    inv.add(Block.planks, 2);
    expect(canMake(inv, recipe('iron ingot'), NO_FURNACE)).toBe(false);
    // Furnace present, fuel present: works, burning one plank.
    expect(craft(inv, recipe('iron ingot'), FURNACE)).toBe(true);
    expect(inv.countOf(Item.ingot)).toBe(1);
    expect(inv.countOf(Block.ore)).toBe(1);
    expect(inv.countOf(Block.planks)).toBe(1); // one fuel consumed
  });

  it('refuses to smelt with no fuel even at a furnace', () => {
    const inv = new Inventory();
    inv.add(Block.ore, 1);
    expect(canMake(inv, recipe('iron ingot'), FURNACE)).toBe(false);
    expect(craft(inv, recipe('iron ingot'), FURNACE)).toBe(false);
    expect(inv.countOf(Block.ore)).toBe(1);
  });

  it('charcoal needs a spare log: one to smelt, one to burn', () => {
    const inv = new Inventory();
    inv.add(Block.log, 1); // only enough to be the input, none to burn
    expect(canMake(inv, recipe('charcoal'), FURNACE)).toBe(false);
    inv.add(Block.log, 1); // now 2 logs
    expect(craft(inv, recipe('charcoal'), FURNACE)).toBe(true);
    expect(inv.countOf(Item.charcoal)).toBe(1);
    expect(inv.countOf(Block.log)).toBe(0); // one input + one fuel
  });

  it('charcoal works as fuel for later smelts', () => {
    const inv = new Inventory();
    inv.add(Block.ore, 1);
    inv.add(Item.charcoal, 1);
    expect(craft(inv, recipe('iron ingot'), FURNACE)).toBe(true);
    expect(inv.countOf(Item.ingot)).toBe(1);
    expect(inv.countOf(Item.charcoal)).toBe(0);
  });

  it('smelt count is limited by both inputs and fuel', () => {
    const inv = new Inventory();
    inv.add(Block.ore, 5);
    inv.add(Block.planks, 2); // only 2 fuel
    expect(craftableCount(inv, recipe('iron ingot'), FURNACE)).toBe(2);
    expect(craftableCount(inv, recipe('iron ingot'), NO_FURNACE)).toBe(0);
  });

  it('smelts sand into glass', () => {
    const inv = new Inventory();
    inv.add(Block.sand, 1);
    inv.add(Item.charcoal, 1);
    expect(craft(inv, recipe('glass'), FURNACE)).toBe(true);
    expect(inv.countOf(Block.glass)).toBe(1);
  });
});

describe('gem pickaxe recipe', () => {
  it('crafts from gems and sticks', () => {
    const inv = new Inventory();
    inv.add(Item.gem, 3);
    inv.add(Item.stick, 2);
    expect(craft(inv, recipe('gem pickaxe'), NO_FURNACE)).toBe(true);
    expect(inv.countOf(Item.gemPickaxe)).toBe(1);
  });
});
