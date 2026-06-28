/**
 * Water buckets: the pure scoop/pour decision, the recipe, and that buckets
 * don't stack.
 */
import { describe, expect, it } from 'vitest';
import { useBucketOn, stackLimit, Item } from '../src/world/items';
import { craft, RECIPES } from '../src/world/crafting';
import { Inventory } from '../src/player/inventory';
import { Block } from '../src/world/blocks';

describe('useBucketOn', () => {
  it('empty bucket scoops a water source into a full bucket', () => {
    expect(useBucketOn(Item.bucket, Block.water)).toEqual({
      setCell: Block.air,
      newHeld: Item.waterBucket,
    });
  });

  it('full bucket pours into an empty cell, emptying the bucket', () => {
    expect(useBucketOn(Item.waterBucket, Block.air)).toEqual({
      setCell: Block.water,
      newHeld: Item.bucket,
    });
  });

  it('does nothing for invalid combinations', () => {
    expect(useBucketOn(Item.bucket, Block.air)).toBeNull(); // empty on air
    expect(useBucketOn(Item.bucket, Block.stone)).toBeNull(); // empty on solid
    expect(useBucketOn(Item.waterBucket, Block.water)).toBeNull(); // full on water
    expect(useBucketOn(Item.waterBucket, Block.stone)).toBeNull(); // full on solid
    expect(useBucketOn(Item.ironPickaxe, Block.water)).toBeNull(); // not a bucket
  });

  it('round-trips: scoop then pour returns to empty bucket + water', () => {
    const scoop = useBucketOn(Item.bucket, Block.water)!;
    expect(scoop.newHeld).toBe(Item.waterBucket);
    const pour = useBucketOn(scoop.newHeld, Block.air)!;
    expect(pour.newHeld).toBe(Item.bucket);
    expect(pour.setCell).toBe(Block.water);
  });
});

describe('bucket item', () => {
  it('buckets are unstackable', () => {
    expect(stackLimit(Item.bucket)).toBe(1);
    expect(stackLimit(Item.waterBucket)).toBe(1);
  });

  it('crafts an empty bucket from iron ingots', () => {
    const recipe = RECIPES.find((r) => r.name === 'bucket');
    expect(recipe).toBeDefined();
    const inv = new Inventory();
    inv.add(Item.ingot, 3);
    expect(craft(inv, recipe!, { furnaceAvailable: false })).toBe(true);
    expect(inv.countOf(Item.bucket)).toBe(1);
    expect(inv.countOf(Item.ingot)).toBe(0);
  });
});
