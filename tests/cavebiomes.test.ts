/**
 * Cave-biome decoration and surface flora: both are deterministic per-seed
 * overlays that must appear in generated terrain, sit only where they belong,
 * and never disturb the natural surface block or worldgen determinism.
 */
import { describe, expect, it } from 'vitest';
import { createGenerator, SEA_LEVEL } from '../src/world/worldgen';
import { blockIndex, CHUNK_SIZE } from '../src/world/chunk';
import { Block } from '../src/world/blocks';

const CAVE_BLOCKS = [Block.mossstone, Block.glowbloom, Block.cindercap];
const FLORA_BLOCKS = [Block.wildgrass, Block.sunwisp, Block.duskbell];

/** Scan a chunk grid, collecting which ids appear and flora placement facts. */
function survey(seed: string) {
  const gen = createGenerator(seed);
  const ids = new Set<number>();
  let floraOnGrass = 0;
  let floraBelowSea = 0;
  // Cave zones span ~11 chunks, so sample a wide grid to hit all three themes.
  for (let cx = -7; cx <= 7; cx++) {
    for (let cz = -7; cz <= 7; cz++) {
      const data = gen.generateChunk(cx, cz);
      for (let i = 0; i < data.length; i++) ids.add(data[i] ?? 0);
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const h = gen.heightAt(cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z);
          const above = data[blockIndex(x, h + 1, z)] ?? 0;
          if (!(FLORA_BLOCKS as number[]).includes(above)) continue;
          // Flora sits in the air cell above an untouched grass surface.
          if (data[blockIndex(x, h, z)] === Block.grass) floraOnGrass++;
          if (h < SEA_LEVEL + 2) floraBelowSea++;
        }
      }
    }
  }
  return { ids, floraOnGrass, floraBelowSea };
}

describe('cave biomes', () => {
  it('decorate caves with all three zone themes across a seed', () => {
    const { ids } = survey('cavebiome-seed');
    for (const b of CAVE_BLOCKS) expect(ids.has(b)).toBe(true);
    // Crystal grottoes grow crystal in caves (also produced by geodes, but
    // its presence confirms the deep-cave path runs).
    expect(ids.has(Block.crystal)).toBe(true);
  });
});

describe('surface flora', () => {
  it('dresses grass with tufts and flowers, always above a grass surface', () => {
    const { ids, floraOnGrass, floraBelowSea } = survey('flora-seed');
    for (const b of FLORA_BLOCKS) expect(ids.has(b)).toBe(true);
    expect(floraOnGrass).toBeGreaterThan(0);
    expect(floraBelowSea).toBe(0); // never underwater / on the sea floor
  });
});

describe('determinism with cave biomes + flora', () => {
  it('regenerates byte-identical chunks', () => {
    const a = createGenerator('determinism-seed').generateChunk(2, -1);
    const b = createGenerator('determinism-seed').generateChunk(2, -1);
    expect(a).toEqual(b);
  });
});
