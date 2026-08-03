/**
 * Chests: the per-position container store and cross-inventory transfer.
 */
import { describe, expect, it } from 'vitest';
import { ContainerStore } from '../src/world/containers';
import { CHEST_SIZE, Inventory, transferStack } from '../src/player/inventory';
import { Block } from '../src/world/blocks';
import { Item } from '../src/world/items';

describe('ContainerStore', () => {
  it('creates an empty 27-slot inventory for a placed chest', () => {
    const store = new ContainerStore();
    store.onBlockChanged('place', Block.chest, 3, 64, -2);
    expect(store.has(3, 64, -2)).toBe(true);
    const inv = store.get(3, 64, -2);
    expect(inv.size).toBe(CHEST_SIZE);
    expect(inv.slots.every((s) => s === null)).toBe(true);
  });

  it('keeps contents independent per position', () => {
    const store = new ContainerStore();
    store.get(0, 0, 0).add(Block.stone, 5);
    store.get(1, 0, 0).add(Block.dirt, 9);
    expect(store.get(0, 0, 0).countOf(Block.stone)).toBe(5);
    expect(store.get(1, 0, 0).countOf(Block.stone)).toBe(0);
    expect(store.get(1, 0, 0).countOf(Block.dirt)).toBe(9);
  });

  it('spills contents to the player and forgets the chest on break', () => {
    const store = new ContainerStore();
    const chest = store.get(2, 30, 2);
    chest.add(Block.cobblestone, 40);
    chest.add(Item.ingot, 3);
    const player = new Inventory();
    store.onBlockChanged('break', Block.chest, 2, 30, 2, (id, count) => player.add(id, count));
    expect(store.has(2, 30, 2)).toBe(false);
    expect(player.countOf(Block.cobblestone)).toBe(40);
    expect(player.countOf(Item.ingot)).toBe(3);
  });

  it('round-trips through serialize/load', () => {
    const store = new ContainerStore();
    store.get(5, 70, -9).add(Block.planks, 12);
    store.get(-1, 12, 4).add(Item.charcoal, 7);
    const data = store.serialize();
    expect(data.length).toBe(2);

    const restored = new ContainerStore();
    restored.load(data);
    expect(restored.get(5, 70, -9).countOf(Block.planks)).toBe(12);
    expect(restored.get(-1, 12, 4).countOf(Item.charcoal)).toBe(7);
  });

  it('tolerates malformed saved data', () => {
    const store = new ContainerStore();
    store.load([{ pos: [1, 2, 3], items: [[Block.stone, 4]] }, { pos: [0, 0] } as never, null as never]);
    expect(store.get(1, 2, 3).countOf(Block.stone)).toBe(4);
  });
});

describe('transferStack (chest <-> player)', () => {
  it('moves a whole stack into the other inventory', () => {
    const chest = new Inventory(CHEST_SIZE);
    const player = new Inventory();
    chest.add(Block.stone, 30);
    transferStack(chest, 0, player);
    expect(chest.slots[0]).toBeNull();
    expect(player.countOf(Block.stone)).toBe(30);
  });

  it('leaves the remainder behind when the target is nearly full', () => {
    const chest = new Inventory(CHEST_SIZE);
    const player = new Inventory();
    // Fill the player so only 10 stone can land.
    for (let i = 0; i < player.size; i++) player.slots[i] = { id: Block.dirt, count: 64 };
    player.slots[0] = { id: Block.stone, count: 54 };
    chest.add(Block.stone, 40);
    transferStack(chest, 0, player);
    expect(player.countOf(Block.stone)).toBe(64); // topped the partial stack
    expect(chest.countOf(Block.stone)).toBe(30); // 10 fit, 30 remain
  });

  it('does nothing for an empty source slot', () => {
    const chest = new Inventory(CHEST_SIZE);
    const player = new Inventory();
    transferStack(chest, 5, player);
    expect(player.slots.every((s) => s === null)).toBe(true);
  });
});
