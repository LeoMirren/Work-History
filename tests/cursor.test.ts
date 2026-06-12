/**
 * Inventory cursor: left/right click stack handling.
 */
import { describe, expect, it } from 'vitest';
import { Cursor } from '../src/player/cursor';
import { Inventory } from '../src/player/inventory';
import { Block } from '../src/world/blocks';
import { Item } from '../src/world/items';

function inv(): Inventory {
  return new Inventory(36);
}

describe('left click', () => {
  it('picks up a whole stack into an empty hand', () => {
    const i = inv();
    i.slots[0] = { id: Block.dirt, count: 20 };
    const c = new Cursor();
    c.leftClick(i, 0);
    expect(c.held).toEqual({ id: Block.dirt, count: 20 });
    expect(i.slots[0]).toBeNull();
  });

  it('drops a held stack onto an empty slot', () => {
    const i = inv();
    const c = new Cursor();
    c.held = { id: Block.stone, count: 12 };
    c.leftClick(i, 5);
    expect(i.slots[5]).toEqual({ id: Block.stone, count: 12 });
    expect(c.held).toBeNull();
  });

  it('merges onto a matching slot, leaving overflow in hand', () => {
    const i = inv();
    i.slots[0] = { id: Block.dirt, count: 60 };
    const c = new Cursor();
    c.held = { id: Block.dirt, count: 10 };
    c.leftClick(i, 0);
    expect(i.slots[0]).toEqual({ id: Block.dirt, count: 64 });
    expect(c.held).toEqual({ id: Block.dirt, count: 6 });
  });

  it('swaps with a different item', () => {
    const i = inv();
    i.slots[0] = { id: Block.sand, count: 5 };
    const c = new Cursor();
    c.held = { id: Block.stone, count: 3 };
    c.leftClick(i, 0);
    expect(i.slots[0]).toEqual({ id: Block.stone, count: 3 });
    expect(c.held).toEqual({ id: Block.sand, count: 5 });
  });
});

describe('right click', () => {
  it('picks up half (rounded up) from a slot', () => {
    const i = inv();
    i.slots[0] = { id: Block.cobblestone, count: 7 };
    const c = new Cursor();
    c.rightClick(i, 0);
    expect(c.held).toEqual({ id: Block.cobblestone, count: 4 });
    expect(i.slots[0]).toEqual({ id: Block.cobblestone, count: 3 });
  });

  it('drops a single item from the hand onto empty/matching slots', () => {
    const i = inv();
    const c = new Cursor();
    c.held = { id: Block.planks, count: 3 };
    c.rightClick(i, 0); // onto empty
    expect(i.slots[0]).toEqual({ id: Block.planks, count: 1 });
    expect(c.held).toEqual({ id: Block.planks, count: 2 });
    c.rightClick(i, 0); // onto matching
    expect(i.slots[0]).toEqual({ id: Block.planks, count: 2 });
    expect(c.held).toEqual({ id: Block.planks, count: 1 });
  });

  it('will not overflow a full matching slot', () => {
    const i = inv();
    i.slots[0] = { id: Block.dirt, count: 64 };
    const c = new Cursor();
    c.held = { id: Block.dirt, count: 5 };
    c.rightClick(i, 0);
    expect(i.slots[0]).toEqual({ id: Block.dirt, count: 64 });
    expect(c.held).toEqual({ id: Block.dirt, count: 5 }); // unchanged
  });

  it('single tools (limit 1) split as a whole', () => {
    const i = inv();
    i.slots[0] = { id: Item.ironPickaxe, count: 1 };
    const c = new Cursor();
    c.rightClick(i, 0);
    expect(c.held).toEqual({ id: Item.ironPickaxe, count: 1 });
    expect(i.slots[0]).toBeNull();
  });
});

describe('returnTo', () => {
  it('spills held items back and clears the hand', () => {
    const i = inv();
    const c = new Cursor();
    c.held = { id: Block.stone, count: 9 };
    c.returnTo(i);
    expect(c.held).toBeNull();
    expect(i.countOf(Block.stone)).toBe(9);
  });
});
