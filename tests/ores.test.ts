/**
 * The deep-metal update: silver / dusk / ember ore gates, the smith chains
 * that consume them, and the veins actually appearing in generated terrain.
 */
import { describe, expect, it } from 'vitest';
import { Block } from '../src/world/blocks';
import { armorReductionOf, Item, ORES } from '../src/world/items';
import { RECIPES } from '../src/world/crafting';
import { createGenerator } from '../src/world/worldgen';
import { blockIndex, CHUNK_SIZE } from '../src/world/chunk';

describe('deep-metal ores', () => {
  it('gate on the right pickaxe tiers and drop the right things', () => {
    expect(ORES.get(Block.silverOre)).toEqual({ drop: { id: Block.silverOre, count: 1 }, requiredTier: 3 });
    expect(ORES.get(Block.duskOre)).toEqual({ drop: { id: Block.duskOre, count: 1 }, requiredTier: 6 });
    // Ember ore skips smelting: the shard drops straight out of the wall.
    expect(ORES.get(Block.emberOre)).toEqual({ drop: { id: Item.emberShard, count: 1 }, requiredTier: 4 });
  });

  it('slot silver and dusksteel vests into the armor ladder', () => {
    expect(armorReductionOf(Item.silverVest)).toBeGreaterThan(armorReductionOf(Item.goldVest));
    expect(armorReductionOf(Item.silverVest)).toBeLessThan(armorReductionOf(Item.gemVest));
    expect(armorReductionOf(Item.duskVest)).toBeGreaterThan(armorReductionOf(Item.gemVest));
    expect(armorReductionOf(Item.duskVest)).toBeLessThan(1);
  });

  it('smith chains: smelt both metals, craft vests, blade and ember torches', () => {
    const outputs = new Map(RECIPES.map((r) => [r.name, r]));
    expect(outputs.get('silver ingot')?.station).toBe('smelt');
    expect(outputs.get('dusksteel ingot')?.station).toBe('smelt');
    expect(outputs.get('silver vest')?.output).toBe(Item.silverVest);
    expect(outputs.get('dusksteel vest')?.output).toBe(Item.duskVest);
    expect(outputs.get('duskblade')?.output).toBe(Item.duskblade);
    expect(outputs.get('ember torches')?.outputCount).toBe(6);
  });

  it('lays silver and dusk veins into deep overworld stone', () => {
    const gen = createGenerator('vein census', 'overworld');
    const counts = new Map<number, number>();
    for (let cx = 0; cx < 12; cx++) {
      const data = gen.generateChunk(cx, 0);
      for (let y = 2; y <= 24; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          for (let x = 0; x < CHUNK_SIZE; x++) {
            const id = data[blockIndex(x, y, z)] ?? 0;
            counts.set(id, (counts.get(id) ?? 0) + 1);
          }
        }
      }
    }
    expect(counts.get(Block.silverOre) ?? 0).toBeGreaterThan(0);
    expect(counts.get(Block.duskOre) ?? 0).toBeGreaterThan(0);
    // Dusk is the rarer prize.
    expect(counts.get(Block.duskOre) ?? 0).toBeLessThan(counts.get(Block.silverOre) ?? 0);
  });

  it('crystallizes ember ore in the underworld walls', () => {
    const gen = createGenerator('ember census', 'underworld');
    let emberOre = 0;
    for (let cx = 0; cx < 10; cx++) {
      const data = gen.generateChunk(cx, 3);
      for (let i = 0; i < data.length; i++) if (data[i] === Block.emberOre) emberOre++;
    }
    expect(emberOre).toBeGreaterThan(0);
  });
});
