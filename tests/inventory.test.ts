/**
 * Survival update: inventory stacking, movement and serialization.
 */
import { describe, expect, it } from 'vitest';
import { HOTBAR_SIZE, Inventory, INVENTORY_SIZE } from '../src/player/inventory';
import { Item } from '../src/world/items';
import { Block } from '../src/world/blocks';

describe('inventory add/remove', () => {
  it('fills hotbar first, stacks to 64, reports overflow', () => {
    const inv = new Inventory();
    expect(inv.add(Block.dirt, 10)).toBe(0);
    expect(inv.slots[0]).toEqual({ id: Block.dirt, count: 10 });
    expect(inv.add(Block.dirt, 60)).toBe(0); // tops up slot 0 to 64, spills 6
    expect(inv.slots[0]).toEqual({ id: Block.dirt, count: 64 });
    expect(inv.slots[1]).toEqual({ id: Block.dirt, count: 6 });
    // Fill everything, then overflow.
    for (let i = 0; i < INVENTORY_SIZE; i++) inv.slots[i] = { id: Block.stone, count: 64 };
    expect(inv.add(Block.stone, 5)).toBe(5);
  });

  it('tools never stack', () => {
    const inv = new Inventory();
    expect(inv.add(Item.woodPickaxe, 2)).toBe(0);
    expect(inv.slots[0]).toEqual({ id: Item.woodPickaxe, count: 1 });
    expect(inv.slots[1]).toEqual({ id: Item.woodPickaxe, count: 1 });
  });

  it('counts and removes across slots, refusing partial removals', () => {
    const inv = new Inventory();
    inv.add(Item.stick, 70); // 64 + 6 across two slots
    expect(inv.countOf(Item.stick)).toBe(70);
    expect(inv.remove(Item.stick, 100)).toBe(false);
    expect(inv.countOf(Item.stick)).toBe(70); // untouched on failure
    expect(inv.remove(Item.stick, 66)).toBe(true);
    expect(inv.countOf(Item.stick)).toBe(4);
  });

  it('consumeOne empties a slot at zero', () => {
    const inv = new Inventory();
    inv.add(Block.planks, 2);
    expect(inv.consumeOne(0)).toBe(true);
    expect(inv.slots[0]).toEqual({ id: Block.planks, count: 1 });
    expect(inv.consumeOne(0)).toBe(true);
    expect(inv.slots[0]).toBeNull();
    expect(inv.consumeOne(0)).toBe(false);
  });
});

describe('inventory movement', () => {
  it('moveOrSwap merges same ids and swaps different ones', () => {
    const inv = new Inventory();
    inv.slots[0] = { id: Block.dirt, count: 40 };
    inv.slots[1] = { id: Block.dirt, count: 40 };
    inv.moveOrSwap(0, 1); // merge: 1 -> 64, 0 keeps 16
    expect(inv.slots[1]).toEqual({ id: Block.dirt, count: 64 });
    expect(inv.slots[0]).toEqual({ id: Block.dirt, count: 16 });
    inv.slots[2] = { id: Block.sand, count: 5 };
    inv.moveOrSwap(0, 2); // swap
    expect(inv.slots[0]).toEqual({ id: Block.sand, count: 5 });
    expect(inv.slots[2]).toEqual({ id: Block.dirt, count: 16 });
  });

  it('quickMove shuttles between hotbar and main inventory', () => {
    const inv = new Inventory();
    inv.slots[0] = { id: Block.log, count: 12 };
    inv.quickMove(0);
    expect(inv.slots[0]).toBeNull();
    expect(inv.slots[HOTBAR_SIZE]).toEqual({ id: Block.log, count: 12 });
    inv.quickMove(HOTBAR_SIZE);
    expect(inv.slots[0]).toEqual({ id: Block.log, count: 12 });
    expect(inv.slots[HOTBAR_SIZE]).toBeNull();
  });

  it('bumps version on every mutation', () => {
    const inv = new Inventory();
    const v0 = inv.version;
    inv.add(Block.dirt, 1);
    inv.moveOrSwap(0, 5);
    inv.consumeOne(5);
    expect(inv.version).toBeGreaterThan(v0 + 1);
  });
});

describe('inventory serialization', () => {
  it('round-trips through serialize/load', () => {
    const inv = new Inventory();
    inv.add(Block.cobblestone, 70);
    inv.add(Item.ironPickaxe, 1);
    inv.quickMove(0);
    const copy = new Inventory();
    copy.load(inv.serialize());
    expect(copy.serialize()).toEqual(inv.serialize());
  });

  it('tolerates malformed persisted data', () => {
    const inv = new Inventory();
    inv.load([[Block.dirt, 5], null, [0, 9], [Block.stone, -3], [Item.woodPickaxe, 99]] as never);
    expect(inv.slots[0]).toEqual({ id: Block.dirt, count: 5 });
    expect(inv.slots[1]).toBeNull();
    expect(inv.slots[2]).toBeNull(); // id 0 rejected
    expect(inv.slots[3]).toBeNull(); // negative count rejected
    expect(inv.slots[4]).toEqual({ id: Item.woodPickaxe, count: 1 }); // clamped to stack limit
    inv.load(undefined);
    expect(inv.slots.every((s) => s === null)).toBe(true);
  });
});
