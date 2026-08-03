/**
 * Farming: tilling, planting, random-tick growth, harvest drops and bread.
 */
import { describe, expect, it } from 'vitest';
import { Block } from '../src/world/blocks';
import { bonusDropFor, dropFor, foodValue, isFood, Item, stackLimit } from '../src/world/items';
import { craft, RECIPES } from '../src/world/crafting';
import { Inventory } from '../src/player/inventory';
import {
  CropGrowth,
  GROW_CHANCE,
  isCrop,
  nextCropStage,
  plantResult,
  tillResult,
  type GrowthWorld,
} from '../src/world/farming';

const ctx = { furnaceAvailable: false };

function recipe(name: string) {
  const r = RECIPES.find((r) => r.name === name);
  if (!r) throw new Error(`missing recipe ${name}`);
  return r;
}

describe('tilling and planting rules', () => {
  it('a hoe tills grass and dirt into farmland', () => {
    expect(tillResult(Item.hoe, Block.grass)).toBe(Block.farmland);
    expect(tillResult(Item.hoe, Block.dirt)).toBe(Block.farmland);
  });

  it('tilling needs a hoe and tillable soil', () => {
    expect(tillResult(Item.hoe, Block.stone)).toBeNull();
    expect(tillResult(Item.seeds, Block.grass)).toBeNull();
  });

  it('seeds plant a sprout on farmland under air', () => {
    expect(plantResult(Item.seeds, Block.farmland, Block.air)).toBe(Block.cropSprout);
    expect(plantResult(Item.seeds, Block.dirt, Block.air)).toBeNull();
    expect(plantResult(Item.seeds, Block.farmland, Block.cropSprout)).toBeNull();
    expect(plantResult(Item.grain, Block.farmland, Block.air)).toBeNull();
  });
});

describe('crop growth', () => {
  it('stages advance sprout → growing → ripe and stop', () => {
    expect(nextCropStage(Block.cropSprout)).toBe(Block.cropGrowing);
    expect(nextCropStage(Block.cropGrowing)).toBe(Block.cropRipe);
    expect(nextCropStage(Block.cropRipe)).toBeNull();
    expect(nextCropStage(Block.farmland)).toBeNull();
    expect(isCrop(Block.cropSprout) && isCrop(Block.cropGrowing) && isCrop(Block.cropRipe)).toBe(true);
    expect(isCrop(Block.farmland)).toBe(false);
  });

  function fakeWorld(): GrowthWorld & { cells: Map<string, number> } {
    const cells = new Map<string, number>();
    return {
      cells,
      getBlock: (x, y, z) => cells.get(`${x},${y},${z}`) ?? Block.air,
      setBlock: (x, y, z, id) => void cells.set(`${x},${y},${z}`, id),
    };
  }

  it('random ticks ripen a crop the player stands beside', () => {
    const world = fakeWorld();
    world.cells.set('0,10,0', Block.cropSprout);
    // rng cycle: both sample offsets land on column (0,0); grow roll passes.
    const seq = [0.5, 0.5, 0];
    let i = 0;
    const growth = new CropGrowth(() => seq[i++ % seq.length] ?? 0);
    growth.fixedUpdate(1.001, world, 0.5, 0.5);
    expect(world.cells.get('0,10,0')).toBe(Block.cropRipe);
  });

  it('a failed grow roll leaves the stage unchanged', () => {
    const world = fakeWorld();
    world.cells.set('0,10,0', Block.cropSprout);
    const seq = [0.5, 0.5, GROW_CHANCE]; // roll === chance fails the < test
    let i = 0;
    const growth = new CropGrowth(() => seq[i++ % seq.length] ?? 0);
    growth.fixedUpdate(1.001, world, 0.5, 0.5);
    expect(world.cells.get('0,10,0')).toBe(Block.cropSprout);
  });

  it('no tick fires before a full second accumulates', () => {
    const world = fakeWorld();
    world.cells.set('0,10,0', Block.cropSprout);
    const growth = new CropGrowth(() => 0);
    growth.fixedUpdate(0.4, world, 0.5, 0.5);
    expect(world.cells.get('0,10,0')).toBe(Block.cropSprout);
  });
});

describe('harvest drops', () => {
  it('immature crops refund a seed; ripe crops yield grain plus seeds', () => {
    expect(dropFor(Block.cropSprout, 0)).toEqual({ id: Item.seeds, count: 1 });
    expect(dropFor(Block.cropGrowing, 0)).toEqual({ id: Item.seeds, count: 1 });
    expect(dropFor(Block.cropRipe, 0)).toEqual({ id: Item.grain, count: 1 });
    expect(bonusDropFor(Block.cropRipe, 0.9)).toEqual({ id: Item.seeds, count: 1 });
    expect(bonusDropFor(Block.cropRipe, 0.1)).toEqual({ id: Item.seeds, count: 2 });
  });

  it('farmland breaks back into dirt; grass sometimes hides seeds', () => {
    expect(dropFor(Block.farmland, 0)).toEqual({ id: Block.dirt, count: 1 });
    expect(bonusDropFor(Block.grass, 0.05)).toEqual({ id: Item.seeds, count: 1 });
    expect(bonusDropFor(Block.grass, 0.9)).toBeNull();
  });
});

describe('recipes and food', () => {
  it('crafts a hoe from planks and sticks (unstackable tool)', () => {
    const inv = new Inventory();
    inv.add(Block.planks, 2);
    inv.add(Item.stick, 2);
    expect(craft(inv, recipe('hoe'), ctx)).toBe(true);
    expect(inv.countOf(Item.hoe)).toBe(1);
    expect(stackLimit(Item.hoe)).toBe(1);
  });

  it('bakes bread from grain and registers as food', () => {
    const inv = new Inventory();
    inv.add(Item.grain, 3);
    expect(craft(inv, recipe('bread'), ctx)).toBe(true);
    expect(inv.countOf(Item.bread)).toBe(1);
    expect(inv.countOf(Item.grain)).toBe(0);
    expect(isFood(Item.bread)).toBe(true);
    expect(foodValue(Item.bread)).toBe(8);
  });
});
