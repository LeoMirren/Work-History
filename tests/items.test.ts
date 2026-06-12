/**
 * Survival update: drop tables and tool-adjusted mining times.
 */
import { describe, expect, it } from 'vitest';
import { breakSecondsFor, dropFor, isBlockId, Item, pickaxeTier, stackLimit } from '../src/world/items';
import { Block } from '../src/world/blocks';

describe('item basics', () => {
  it('classifies blocks vs items and stack limits', () => {
    expect(isBlockId(Block.stone)).toBe(true);
    expect(isBlockId(Item.stick)).toBe(false);
    expect(isBlockId(0)).toBe(false);
    expect(stackLimit(Block.dirt)).toBe(64);
    expect(stackLimit(Item.stick)).toBe(64);
    expect(stackLimit(Item.ironPickaxe)).toBe(1); // tools don't stack
  });

  it('knows pickaxe tiers', () => {
    expect(pickaxeTier(0)).toBe(0);
    expect(pickaxeTier(Block.stone)).toBe(0);
    expect(pickaxeTier(Item.woodPickaxe)).toBe(1);
    expect(pickaxeTier(Item.stonePickaxe)).toBe(2);
    expect(pickaxeTier(Item.ironPickaxe)).toBe(3);
  });
});

describe('drop table', () => {
  it('stone crumbles to cobblestone; grass turns up dirt', () => {
    expect(dropFor(Block.stone, 0)).toEqual({ id: Block.cobblestone, count: 1 });
    expect(dropFor(Block.grass, 0)).toEqual({ id: Block.dirt, count: 1 });
  });

  it('most blocks drop themselves', () => {
    expect(dropFor(Block.dirt, 0)).toEqual({ id: Block.dirt, count: 1 });
    expect(dropFor(Block.log, 0)).toEqual({ id: Block.log, count: 1 });
    expect(dropFor(Block.sand, 0)).toEqual({ id: Block.sand, count: 1 });
    expect(dropFor(Block.glass, 0)).toEqual({ id: Block.glass, count: 1 });
  });

  it('leaves, water, bedrock and air drop nothing', () => {
    expect(dropFor(Block.leaves, Item.ironPickaxe)).toBeNull();
    expect(dropFor(Block.water, 0)).toBeNull();
    expect(dropFor(Block.bedrock, Item.ironPickaxe)).toBeNull();
    expect(dropFor(Block.air, 0)).toBeNull();
  });

  it('ore requires a pickaxe to drop', () => {
    expect(dropFor(Block.ore, 0)).toBeNull();
    expect(dropFor(Block.ore, Item.stick)).toBeNull();
    expect(dropFor(Block.ore, Item.woodPickaxe)).toEqual({ id: Block.ore, count: 1 });
    expect(dropFor(Block.ore, Item.ironPickaxe)).toEqual({ id: Block.ore, count: 1 });
  });
});

describe('tool-adjusted break times', () => {
  it('pickaxes speed up the stone family by tier', () => {
    expect(breakSecondsFor(Block.stone, 0)).toBeCloseTo(2.25);
    expect(breakSecondsFor(Block.stone, Item.woodPickaxe)).toBeCloseTo(2.25 / 2);
    expect(breakSecondsFor(Block.stone, Item.stonePickaxe)).toBeCloseTo(2.25 / 4);
    expect(breakSecondsFor(Block.stone, Item.ironPickaxe)).toBeCloseTo(2.25 / 6);
    expect(breakSecondsFor(Block.cobblestone, Item.ironPickaxe)).toBeCloseTo(2.25 / 6);
    expect(breakSecondsFor(Block.brick, Item.stonePickaxe)).toBeCloseTo(2.25 / 4);
  });

  it('bare-handed ore is painfully slow', () => {
    expect(breakSecondsFor(Block.ore, 0)).toBeCloseTo(3 * 5);
    expect(breakSecondsFor(Block.ore, Item.woodPickaxe)).toBeCloseTo(3 / 2);
  });

  it('non-pick blocks ignore the tool; bedrock stays unbreakable', () => {
    expect(breakSecondsFor(Block.dirt, Item.ironPickaxe)).toBeCloseTo(0.75);
    expect(breakSecondsFor(Block.log, Item.ironPickaxe)).toBeCloseTo(1.5);
    expect(breakSecondsFor(Block.bedrock, Item.ironPickaxe)).toBe(Infinity);
    expect(breakSecondsFor(Block.water, Item.ironPickaxe)).toBe(Infinity);
  });
});
