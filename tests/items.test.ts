/**
 * Survival update: drop tables and tool-adjusted mining times.
 */
import { describe, expect, it } from 'vitest';
import { breakSecondsFor, dropFor, iconTileFor, isBlockId, Item, itemName, pickaxeTier, stackLimit } from '../src/world/items';
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
    expect(pickaxeTier(Item.ironPickaxe)).toBe(4);
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

  it('iron ore requires a stone pickaxe to drop', () => {
    expect(dropFor(Block.ore, 0)).toBeNull();
    expect(dropFor(Block.ore, Item.stick)).toBeNull();
    expect(dropFor(Block.ore, Item.woodPickaxe)).toBeNull(); // wood is too weak now
    expect(dropFor(Block.ore, Item.stonePickaxe)).toEqual({ id: Block.ore, count: 1 });
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

  it('wrong-tool iron ore is painfully slow, right tool is quick', () => {
    expect(breakSecondsFor(Block.ore, 0)).toBeCloseTo(3 * 5);
    expect(breakSecondsFor(Block.ore, Item.woodPickaxe)).toBeCloseTo(3 * 5); // still too weak
    expect(breakSecondsFor(Block.ore, Item.stonePickaxe)).toBeCloseTo(3 / 4);
  });

  it('non-pick blocks ignore the tool; bedrock stays unbreakable', () => {
    expect(breakSecondsFor(Block.dirt, Item.ironPickaxe)).toBeCloseTo(0.75);
    expect(breakSecondsFor(Block.log, Item.ironPickaxe)).toBeCloseTo(1.5);
    expect(breakSecondsFor(Block.bedrock, Item.ironPickaxe)).toBe(Infinity);
    expect(breakSecondsFor(Block.water, Item.ironPickaxe)).toBe(Infinity);
  });
});

describe('ore tiers', () => {
  it('ranks the full pickaxe ladder', () => {
    expect(pickaxeTier(Item.woodPickaxe)).toBe(1);
    expect(pickaxeTier(Item.stonePickaxe)).toBe(2);
    expect(pickaxeTier(Item.copperPickaxe)).toBe(3);
    expect(pickaxeTier(Item.ironPickaxe)).toBe(4);
    expect(pickaxeTier(Item.goldPickaxe)).toBe(5);
    expect(stackLimit(Item.copperPickaxe)).toBe(1);
    expect(stackLimit(Item.goldPickaxe)).toBe(1);
  });

  it('gates each ore behind its required tier', () => {
    // Coal: wood is enough.
    expect(dropFor(Block.coalOre, 0)).toBeNull();
    expect(dropFor(Block.coalOre, Item.woodPickaxe)).toEqual({ id: Item.coal, count: 1 });
    // Iron/copper: need stone or better.
    expect(dropFor(Block.ore, Item.woodPickaxe)).toBeNull();
    expect(dropFor(Block.ore, Item.stonePickaxe)).toEqual({ id: Block.ore, count: 1 });
    expect(dropFor(Block.copperOre, Item.woodPickaxe)).toBeNull();
    expect(dropFor(Block.copperOre, Item.stonePickaxe)).toEqual({ id: Block.copperOre, count: 1 });
    // Gold: needs iron or better; copper/stone aren't enough.
    expect(dropFor(Block.goldOre, Item.copperPickaxe)).toBeNull();
    expect(dropFor(Block.goldOre, Item.ironPickaxe)).toEqual({ id: Block.goldOre, count: 1 });
    expect(dropFor(Block.goldOre, Item.goldPickaxe)).toEqual({ id: Block.goldOre, count: 1 });
  });

  it('mines wrong-tool ores punishingly slowly, right-tool quickly', () => {
    const goldBare = breakSecondsFor(Block.goldOre, 0);
    const goldRight = breakSecondsFor(Block.goldOre, Item.ironPickaxe);
    expect(goldBare).toBeGreaterThan(goldRight * 10); // penalty ×5 vs speed ÷6
    // Higher tiers mine the stone family faster.
    expect(breakSecondsFor(Block.stone, Item.goldPickaxe)).toBeLessThan(
      breakSecondsFor(Block.stone, Item.stonePickaxe),
    );
  });
});

describe('ore item names and icons resolve', () => {
  it('names and tiles every new id', () => {
    for (const id of [Item.coal, Item.copperIngot, Item.goldIngot, Item.copperPickaxe, Item.goldPickaxe]) {
      expect(itemName(id)).not.toMatch(/^item /);
      expect(iconTileFor(id)).toBeGreaterThan(0);
    }
  });
});

describe('geode gems', () => {
  it('crystal needs a stone+ pickaxe and drops a gem', () => {
    expect(dropFor(Block.crystal, 0)).toBeNull();
    expect(dropFor(Block.crystal, Item.woodPickaxe)).toBeNull();
    expect(dropFor(Block.crystal, Item.stonePickaxe)).toEqual({ id: Item.gem, count: 1 });
    expect(dropFor(Block.crystal, Item.gemPickaxe)).toEqual({ id: Item.gem, count: 1 });
  });

  it('gem pickaxe is the apex tier and mines stone fastest', () => {
    expect(pickaxeTier(Item.gemPickaxe)).toBe(6);
    expect(breakSecondsFor(Block.stone, Item.gemPickaxe)).toBeLessThan(
      breakSecondsFor(Block.stone, Item.goldPickaxe),
    );
  });
});
