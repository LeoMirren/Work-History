/**
 * Surface structures: the outpost hut planter (pure), plus that the worldgen
 * stays byte-deterministic with structures enabled.
 */
import { describe, expect, it } from 'vitest';
import { tryPlantHut, createGenerator } from '../src/world/worldgen';
import { blockIndex, CHUNK_SIZE, CHUNK_VOLUME } from '../src/world/chunk';
import { Block } from '../src/world/blocks';

/** A flat all-grass chunk at the given surface height (dirt below). */
function flatGrassChunk(surfaceY: number): { data: Uint8Array; heights: Int32Array } {
  const data = new Uint8Array(CHUNK_VOLUME);
  const heights = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      heights[z * CHUNK_SIZE + x] = surfaceY;
      data[blockIndex(x, 0, z)] = Block.bedrock;
      for (let y = 1; y < surfaceY; y++) data[blockIndex(x, y, z)] = Block.dirt;
      data[blockIndex(x, surfaceY, z)] = Block.grass;
    }
  }
  return { data, heights };
}

describe('outpost hut', () => {
  it('builds a 5x5 cabin on flat grass', () => {
    const { data, heights } = flatGrassChunk(60);
    tryPlantHut(data, heights, 5, 5);
    const floorY = 61;
    // Floor + roof are planks across the footprint.
    expect(data[blockIndex(5, floorY, 5)]).toBe(Block.planks);
    expect(data[blockIndex(9, floorY, 9)]).toBe(Block.planks);
    expect(data[blockIndex(7, 65, 7)]).toBe(Block.planks); // roof
    // Corner walls are cobblestone, interior is hollow.
    expect(data[blockIndex(5, floorY + 1, 5)]).toBe(Block.cobblestone);
    expect(data[blockIndex(7, floorY + 2, 7)]).toBe(Block.air);
    // A door gap on the front (-z) wall.
    expect(data[blockIndex(7, floorY + 1, 5)]).toBe(Block.air);
    expect(data[blockIndex(7, floorY + 2, 5)]).toBe(Block.air);
    // Glass window on the back wall, a lantern, and a chest inside.
    expect(data[blockIndex(7, floorY + 2, 9)]).toBe(Block.glass);
    expect(data[blockIndex(7, 64, 7)]).toBe(Block.lantern);
    expect(data[blockIndex(6, floorY + 1, 6)]).toBe(Block.chest);
  });

  it('refuses to build on uneven ground', () => {
    const { data, heights } = flatGrassChunk(60);
    heights[6 * CHUNK_SIZE + 6] = 61; // one bumped column
    const before = data.slice();
    tryPlantHut(data, heights, 5, 5);
    expect(data).toEqual(before); // untouched
  });

  it('refuses to build below the build line', () => {
    const { data, heights } = flatGrassChunk(40); // < SEA_LEVEL + 2
    const before = data.slice();
    tryPlantHut(data, heights, 5, 5);
    expect(data).toEqual(before);
  });

  it('keeps worldgen byte-deterministic with structures on', () => {
    const a = createGenerator('hut-seed').generateChunk(3, -7);
    const b = createGenerator('hut-seed').generateChunk(3, -7);
    expect(a).toEqual(b);
  });
});
