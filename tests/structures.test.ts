/**
 * Surface structures: the outpost hut / desert ruin / snow dome / shrine
 * planters (pure), plus that the worldgen stays byte-deterministic with
 * structures enabled.
 */
import { describe, expect, it } from 'vitest';
import { tryPlantHut, tryPlantRuin, tryPlantShrine, tryPlantSnowDome, createGenerator } from '../src/world/worldgen';
import { blockIndex, CHUNK_SIZE, CHUNK_VOLUME } from '../src/world/chunk';
import { Block } from '../src/world/blocks';

/** A flat chunk topped with the given surface block (dirt below). */
function flatChunk(surfaceY: number, surface: number): { data: Uint8Array; heights: Int32Array } {
  const data = new Uint8Array(CHUNK_VOLUME);
  const heights = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      heights[z * CHUNK_SIZE + x] = surfaceY;
      data[blockIndex(x, 0, z)] = Block.bedrock;
      for (let y = 1; y < surfaceY; y++) data[blockIndex(x, y, z)] = Block.dirt;
      data[blockIndex(x, surfaceY, z)] = surface;
    }
  }
  return { data, heights };
}

const flatGrassChunk = (surfaceY: number): { data: Uint8Array; heights: Int32Array } =>
  flatChunk(surfaceY, Block.grass);

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

describe('sunken desert ruin', () => {
  it('lays a brick floor, broken walls and a corner chest on flat sand', () => {
    const { data, heights } = flatChunk(60, Block.sand);
    tryPlantRuin(data, heights, 0xc0ffee, 4, 4);
    // Floor is brick across the footprint at ground level.
    expect(data[blockIndex(4, 60, 4)]).toBe(Block.brick);
    expect(data[blockIndex(9, 60, 9)]).toBe(Block.brick);
    // The chest survives in the interior corner.
    expect(data[blockIndex(5, 61, 5)]).toBe(Block.chest);
    // Perimeter wall stubs are brick or already-crumbled air, never sand.
    let stubs = 0;
    for (let d = 0; d < 6; d++) {
      const id = data[blockIndex(4 + d, 61, 4)];
      expect(id === Block.brick || id === Block.air).toBe(true);
      if (id === Block.brick) stubs++;
    }
    expect(stubs).toBeGreaterThan(0); // at least part of a wall still stands
  });

  it('bails on ground that drifts more than one block', () => {
    const { data, heights } = flatChunk(60, Block.sand);
    heights[6 * CHUNK_SIZE + 6] = 62;
    const before = data.slice();
    tryPlantRuin(data, heights, 0xc0ffee, 4, 4);
    expect(data).toEqual(before);
  });

  it('bails off sand', () => {
    const { data, heights } = flatGrassChunk(60);
    const before = data.slice();
    tryPlantRuin(data, heights, 0xc0ffee, 4, 4);
    expect(data).toEqual(before);
  });
});

describe('snow dome shelter', () => {
  it('raises a hollow lit dome with a door on flat snow', () => {
    const { data, heights } = flatChunk(70, Block.snow);
    tryPlantSnowDome(data, heights, 8, 8);
    // Hollow interior with head clearance at the centre.
    expect(data[blockIndex(8, 71, 8)]).toBe(Block.air);
    expect(data[blockIndex(8, 72, 8)]).toBe(Block.air);
    // Snow shell at the rim, lantern set into the ceiling cap.
    expect(data[blockIndex(11, 71, 8)]).toBe(Block.snow);
    expect(data[blockIndex(8, 73, 8)]).toBe(Block.lantern);
    // Two-tall door gap through the -z rim.
    expect(data[blockIndex(8, 71, 5)]).toBe(Block.air);
    expect(data[blockIndex(8, 72, 5)]).toBe(Block.air);
  });

  it('bails on uneven or non-snow ground', () => {
    const bumpy = flatChunk(70, Block.snow);
    bumpy.heights[8 * CHUNK_SIZE + 8] = 72;
    const before = bumpy.data.slice();
    tryPlantSnowDome(bumpy.data, bumpy.heights, 8, 8);
    expect(bumpy.data).toEqual(before);

    const grass = flatGrassChunk(70);
    const untouched = grass.data.slice();
    tryPlantSnowDome(grass.data, grass.heights, 8, 8);
    expect(grass.data).toEqual(untouched);
  });
});

describe('overgrown shrine', () => {
  it('builds a plinth, pillar and glowing crystal on flat grass', () => {
    const { data, heights } = flatGrassChunk(64);
    tryPlantShrine(data, heights, 6, 6);
    expect(data[blockIndex(6, 65, 6)]).toBe(Block.cobblestone); // plinth corner
    expect(data[blockIndex(8, 65, 8)]).toBe(Block.cobblestone);
    expect(data[blockIndex(7, 66, 7)]).toBe(Block.cobblestone); // pillar
    expect(data[blockIndex(7, 67, 7)]).toBe(Block.cobblestone);
    expect(data[blockIndex(7, 68, 7)]).toBe(Block.crystal); // glowing crown
    expect(data[blockIndex(6, 66, 6)]).toBe(Block.leaves); // creeping corner
  });

  it('bails on uneven ground', () => {
    const { data, heights } = flatGrassChunk(64);
    heights[7 * CHUNK_SIZE + 7] = 65;
    const before = data.slice();
    tryPlantShrine(data, heights, 6, 6);
    expect(data).toEqual(before);
  });
});
