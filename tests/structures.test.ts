/**
 * Surface structures: the outpost hut / desert ruin / snow dome / shrine
 * planters (pure), the buried dungeon carver, hamlets (twin huts + well) and
 * ocean reef décor, plus that the worldgen stays byte-deterministic with
 * structures enabled.
 */
import { describe, expect, it } from 'vitest';
import {
  createGenerator,
  SEA_LEVEL,
  tryCarveDungeon,
  tryPlantHamlet,
  tryPlantHut,
  tryPlantRuin,
  tryPlantShrine,
  tryPlantSnowDome,
} from '../src/world/worldgen';
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

describe('buried dungeon', () => {
  // hash 0 picks the shallowest floor: y0 = 14. Origin at (2, 2).
  const Y0 = 14;

  it('carves two rooms, a corridor, embers, a chest and a crystal', () => {
    const { data } = flatGrassChunk(60);
    tryCarveDungeon(data, 0, 2, 2);
    // Room A: brick floor, hollow 5x4x5 interior, cobble wall + ceiling.
    expect(data[blockIndex(5, Y0, 5)]).toBe(Block.brick);
    expect(data[blockIndex(5, Y0 + 2, 5)]).toBe(Block.air);
    expect(data[blockIndex(5, Y0 + 5, 5)]).toBe(Block.cobblestone); // ceiling
    expect(data[blockIndex(2, Y0 + 2, 5)]).toBe(Block.cobblestone); // -x wall
    // Corridor: doorways punched through both shared walls, two tall,
    // with its own cobble ceiling over the free middle cell.
    expect(data[blockIndex(8, Y0 + 1, 5)]).toBe(Block.air);
    expect(data[blockIndex(9, Y0 + 2, 5)]).toBe(Block.air);
    expect(data[blockIndex(10, Y0 + 1, 5)]).toBe(Block.air);
    expect(data[blockIndex(9, Y0 + 3, 5)]).toBe(Block.cobblestone);
    // Room B: hollow 4x3x4 interior on a brick floor with the crystal.
    expect(data[blockIndex(12, Y0 + 2, 4)]).toBe(Block.air);
    expect(data[blockIndex(12, Y0, 4)]).toBe(Block.brick);
    expect(data[blockIndex(13, Y0 + 1, 4)]).toBe(Block.crystal);
    // Ember-lit opposite wall corners and the loot chest in room A.
    expect(data[blockIndex(3, Y0 + 2, 2)]).toBe(Block.emberrock);
    expect(data[blockIndex(7, Y0 + 2, 8)]).toBe(Block.emberrock);
    expect(data[blockIndex(3, Y0 + 1, 3)]).toBe(Block.chest);
  });

  it('stays untouched when it would breach the surface', () => {
    const { data } = flatGrassChunk(16); // rooms would poke into open air
    const before = data.slice();
    tryCarveDungeon(data, 0, 2, 2);
    expect(data).toEqual(before);
  });

  it('carves buried complexes in real worldgen, deterministically', () => {
    // Chunk (5, 5) of this seed rolls a dungeon under high ground.
    const data = createGenerator('voxelheim-test').generateChunk(5, 5);
    let chest = 0;
    let ember = 0;
    let crystal = 0;
    for (let i = 0; i < data.length; i++) {
      const y = i >> 8;
      if (y > 40) continue; // only the buried band
      if (data[i] === Block.chest) chest++;
      else if (data[i] === Block.emberrock) ember++;
      else if (data[i] === Block.crystal) crystal++;
    }
    expect(chest).toBe(1);
    expect(ember).toBe(2);
    expect(crystal).toBeGreaterThanOrEqual(1); // dungeon crystal (+ any geode)
    expect(data).toEqual(createGenerator('voxelheim-test').generateChunk(5, 5));
  });
});

describe('hamlet', () => {
  it('plants two huts and a watered well on flat grass', () => {
    const { data, heights } = flatGrassChunk(60);
    tryPlantHamlet(data, heights, 0, 1, 1);
    const floorY = 61;
    // Both cabins: plank floors and their corner chests.
    expect(data[blockIndex(1, floorY, 1)]).toBe(Block.planks);
    expect(data[blockIndex(8, floorY, 1)]).toBe(Block.planks);
    expect(data[blockIndex(2, floorY + 1, 2)]).toBe(Block.chest);
    expect(data[blockIndex(9, floorY + 1, 2)]).toBe(Block.chest);
    // Well (hash 0 puts the shaft at x0+5 = 6, z0+6 = 7): cobble rim ring
    // around an open mouth over a two-deep water column.
    expect(data[blockIndex(5, 61, 6)]).toBe(Block.cobblestone);
    expect(data[blockIndex(7, 61, 8)]).toBe(Block.cobblestone);
    expect(data[blockIndex(6, 61, 7)]).toBe(Block.air);
    expect(data[blockIndex(6, 60, 7)]).toBe(Block.water);
    expect(data[blockIndex(6, 59, 7)]).toBe(Block.water);
  });

  it('falls back cleanly (data untouched) on bumpy ground', () => {
    const { data, heights } = flatGrassChunk(60);
    heights[3 * CHUNK_SIZE + 3] = 61; // bump inside hut A's footprint
    heights[3 * CHUNK_SIZE + 10] = 61; // bump inside hut B's footprint
    heights[7 * CHUNK_SIZE + 6] = 61; // bump the well centre
    const before = data.slice();
    tryPlantHamlet(data, heights, 0, 1, 1);
    expect(data).toEqual(before);
  });
});

describe('ocean reef décor', () => {
  it('sprouts seagrass and coral on a deep ocean floor, always below sea level', () => {
    // Chunk (0, -1) of this seed holds a deep sandy shelf that rolls décor.
    const data = createGenerator('voxelheim-test').generateChunk(0, -1);
    let seagrass = 0;
    let coral = 0;
    for (let i = 0; i < data.length; i++) {
      const id = data[i] ?? 0;
      const isCoral = id === Block.coralRose || id === Block.coralTeal;
      if (id !== Block.seagrass && !isCoral) continue;
      if (isCoral) coral++;
      else seagrass++;
      expect(i >> 8).toBeLessThan(SEA_LEVEL); // never above sea level
      // Rooted on the sandy floor (or on coral, for pillar tops).
      expect([Block.sand, Block.coralRose, Block.coralTeal]).toContain(data[i - 256]);
    }
    expect(seagrass).toBeGreaterThan(0);
    expect(coral).toBeGreaterThan(0);
  });
});
