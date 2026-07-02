/**
 * Surface structures: the outpost hut / desert ruin / snow dome / shrine
 * planters (pure), the buried dungeon carver, hamlets (twin huts + well),
 * ocean reef décor, and region-seeded villages — villageCenterFor's grid
 * math plus the long house / farm plot / lamp post / well planters — plus
 * that the worldgen stays byte-deterministic with structures enabled.
 */
import { describe, expect, it } from 'vitest';
import {
  Biome,
  createGenerator,
  SEA_LEVEL,
  tryCarveDungeon,
  tryPlantFarm,
  tryPlantHamlet,
  tryPlantHut,
  tryPlantLampPost,
  tryPlantLongHouse,
  tryPlantRuin,
  tryPlantShrine,
  tryPlantSnowDome,
  tryPlantWell,
  VILLAGE_REGION,
  villageCenterFor,
} from '../src/world/worldgen';
import { cyrb128 } from '../src/world/noise';
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

/** Raise one column of a flat grass chunk to `y` (grass surface, updated heightmap). */
function bumpColumn(chunk: { data: Uint8Array; heights: Int32Array }, x: number, z: number, y: number): void {
  chunk.heights[z * CHUNK_SIZE + x] = y;
  chunk.data[blockIndex(x, y, z)] = Block.grass;
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

  it('rides a small step with a cobblestone plinth, never touching surfaces', () => {
    const chunk = flatGrassChunk(60);
    bumpColumn(chunk, 6, 6, 61); // one-block step inside the footprint
    tryPlantHut(chunk.data, chunk.heights, 5, 5);
    expect(chunk.data[blockIndex(5, 62, 5)]).toBe(Block.planks); // floor rides the high column
    expect(chunk.data[blockIndex(5, 61, 5)]).toBe(Block.cobblestone); // plinth over low ground
    expect(chunk.data[blockIndex(5, 60, 5)]).toBe(Block.grass); // surface block intact
    expect(chunk.data[blockIndex(6, 61, 6)]).toBe(Block.grass); // the step's own surface too
  });

  it('refuses to build on ground that drifts beyond its allowance', () => {
    const chunk = flatGrassChunk(60);
    bumpColumn(chunk, 6, 6, 63); // three-block spike
    const before = chunk.data.slice();
    tryPlantHut(chunk.data, chunk.heights, 5, 5);
    expect(chunk.data).toEqual(before); // untouched
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

describe('well', () => {
  it('digs a watered shaft ringed by a cobblestone rim on flat grass', () => {
    const { data, heights } = flatGrassChunk(60);
    tryPlantWell(data, heights, 5, 5); // 3x3 rim over x 5..7, z 5..7
    expect(data[blockIndex(5, 61, 5)]).toBe(Block.cobblestone);
    expect(data[blockIndex(7, 61, 7)]).toBe(Block.cobblestone);
    expect(data[blockIndex(6, 61, 6)]).toBe(Block.air); // open mouth
    expect(data[blockIndex(6, 60, 6)]).toBe(Block.water); // shaft, two deep
    expect(data[blockIndex(6, 59, 6)]).toBe(Block.water);
  });

  it('needs perfectly level grass', () => {
    const chunk = flatGrassChunk(60);
    bumpColumn(chunk, 6, 5, 61); // bump inside the rim footprint
    const before = chunk.data.slice();
    tryPlantWell(chunk.data, chunk.heights, 5, 5);
    expect(chunk.data).toEqual(before);
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

  it('falls back cleanly (data untouched) on unfit ground', () => {
    const chunk = flatGrassChunk(60);
    // Spikes beyond the huts' drift allowance, and a bump on the well rim
    // (wells demand perfectly level grass).
    bumpColumn(chunk, 3, 3, 64); // inside hut A's footprint
    bumpColumn(chunk, 10, 3, 64); // inside hut B's footprint
    bumpColumn(chunk, 6, 7, 61); // the well shaft column
    const before = chunk.data.slice();
    tryPlantHamlet(chunk.data, chunk.heights, 0, 1, 1);
    expect(chunk.data).toEqual(before);
  });
});

describe('long house', () => {
  it('raises a plank hall with pillars, windows, lantern and chest on flat grass', () => {
    const { data, heights } = flatGrassChunk(60);
    tryPlantLongHouse(data, heights, 3, 5); // 8x5 over x 3..10, z 5..9
    const floorY = 61;
    // Plank floor and roof across the footprint.
    expect(data[blockIndex(3, floorY, 5)]).toBe(Block.planks);
    expect(data[blockIndex(10, floorY, 9)]).toBe(Block.planks);
    expect(data[blockIndex(6, floorY + 4, 7)]).toBe(Block.planks); // roof
    // Cobblestone corner pillars with plank walls between; hollow hall.
    expect(data[blockIndex(3, floorY + 1, 5)]).toBe(Block.cobblestone);
    expect(data[blockIndex(10, floorY + 3, 9)]).toBe(Block.cobblestone);
    expect(data[blockIndex(5, floorY + 1, 5)]).toBe(Block.planks); // wall
    expect(data[blockIndex(6, floorY + 2, 7)]).toBe(Block.air); // interior
    // Door: a 2-tall gap centred on the front (-z) wall.
    expect(data[blockIndex(7, floorY + 1, 5)]).toBe(Block.air);
    expect(data[blockIndex(7, floorY + 2, 5)]).toBe(Block.air);
    // Two glass windows on the back wall.
    expect(data[blockIndex(5, floorY + 2, 9)]).toBe(Block.glass);
    expect(data[blockIndex(8, floorY + 2, 9)]).toBe(Block.glass);
    // A lantern hung at the hall centre and a chest in the corner.
    expect(data[blockIndex(7, floorY + 3, 7)]).toBe(Block.lantern);
    expect(data[blockIndex(4, floorY + 1, 6)]).toBe(Block.chest);
  });

  it('underpins a one-block step with a cobblestone plinth', () => {
    const chunk = flatGrassChunk(60);
    for (let dx = 0; dx < 8; dx++) bumpColumn(chunk, 3 + dx, 9, 61); // raise the back row
    tryPlantLongHouse(chunk.data, chunk.heights, 3, 5);
    expect(chunk.data[blockIndex(3, 62, 5)]).toBe(Block.planks); // floor above the high row
    expect(chunk.data[blockIndex(3, 61, 5)]).toBe(Block.cobblestone); // plinth over low ground
    expect(chunk.data[blockIndex(3, 60, 5)]).toBe(Block.grass); // surface untouched
    expect(chunk.data[blockIndex(3, 61, 9)]).toBe(Block.grass); // high row surface too
  });

  it('bails when the ground drifts beyond the build allowance', () => {
    const chunk = flatGrassChunk(60);
    bumpColumn(chunk, 6, 6, 63); // three-block spike inside the footprint
    const before = chunk.data.slice();
    tryPlantLongHouse(chunk.data, chunk.heights, 3, 5);
    expect(chunk.data).toEqual(before);
  });
});

describe('farm plot', () => {
  it('tills crop rows around a capped water channel on flat grass', () => {
    const { data, heights } = flatGrassChunk(60);
    tryPlantFarm(data, heights, 4, 6); // 6x5 over x 4..9, z 6..10
    const padY = 61; // raised bed plane one above the surface
    // Farmland rows carry alternating growing/ripe crops.
    expect(data[blockIndex(4, padY, 6)]).toBe(Block.farmland);
    expect(data[blockIndex(9, padY, 10)]).toBe(Block.farmland);
    expect(data[blockIndex(4, padY + 1, 6)]).toBe(Block.cropGrowing); // dx+dz even
    expect(data[blockIndex(5, padY + 1, 6)]).toBe(Block.cropRipe); // dx+dz odd
    // Channel row down the middle: cobblestone caps, water between, no crop.
    expect(data[blockIndex(4, padY, 8)]).toBe(Block.cobblestone);
    expect(data[blockIndex(9, padY, 8)]).toBe(Block.cobblestone);
    for (let x = 5; x <= 8; x++) expect(data[blockIndex(x, padY, 8)]).toBe(Block.water);
    expect(data[blockIndex(6, padY + 1, 8)]).toBe(Block.air);
    // The bed rides on the ground: surface blocks survive beneath it.
    expect(data[blockIndex(4, 60, 6)]).toBe(Block.grass);
  });

  it('steps a one-block drift with a dirt underlay', () => {
    const chunk = flatGrassChunk(60);
    bumpColumn(chunk, 4, 6, 61); // origin column one higher
    tryPlantFarm(chunk.data, chunk.heights, 4, 6);
    expect(chunk.data[blockIndex(9, 61, 10)]).toBe(Block.dirt); // fill under the bed
    expect(chunk.data[blockIndex(9, 62, 10)]).toBe(Block.farmland); // bed plane above
    expect(chunk.data[blockIndex(4, 62, 6)]).toBe(Block.farmland); // flush on the high column
  });

  it('bails beyond a single block of drift', () => {
    const chunk = flatGrassChunk(60);
    bumpColumn(chunk, 6, 8, 62); // two-block step inside the plot
    const before = chunk.data.slice();
    tryPlantFarm(chunk.data, chunk.heights, 4, 6);
    expect(chunk.data).toEqual(before);
  });
});

describe('lamp post', () => {
  it('raises a lantern-topped cobblestone pillar on grass', () => {
    const { data, heights } = flatGrassChunk(60);
    tryPlantLampPost(data, heights, 8, 8);
    expect(data[blockIndex(8, 61, 8)]).toBe(Block.cobblestone);
    expect(data[blockIndex(8, 62, 8)]).toBe(Block.cobblestone);
    expect(data[blockIndex(8, 63, 8)]).toBe(Block.cobblestone);
    expect(data[blockIndex(8, 64, 8)]).toBe(Block.lantern);
    expect(data[blockIndex(8, 60, 8)]).toBe(Block.grass); // stands on the surface
  });

  it('bails off grass and below the build line', () => {
    const sandy = flatChunk(60, Block.sand);
    const untouchedSand = sandy.data.slice();
    tryPlantLampPost(sandy.data, sandy.heights, 8, 8);
    expect(sandy.data).toEqual(untouchedSand);

    const low = flatGrassChunk(40); // < SEA_LEVEL + 2
    const untouchedLow = low.data.slice();
    tryPlantLampPost(low.data, low.heights, 8, 8);
    expect(low.data).toEqual(untouchedLow);
  });
});

describe('villageCenterFor', () => {
  const vseed = cyrb128('voxelheim-test villages')[0];

  it('is deterministic per (seed, region)', () => {
    for (let rz = -4; rz <= 4; rz++) {
      for (let rx = -4; rx <= 4; rx++) {
        expect(villageCenterFor(vseed, rx, rz)).toEqual(villageCenterFor(vseed, rx, rz));
      }
    }
  });

  it('hosts villages in roughly 45% of regions', () => {
    let hosted = 0;
    let total = 0;
    for (let rz = -16; rz < 16; rz++) {
      for (let rx = -16; rx < 16; rx++) {
        total++;
        if (villageCenterFor(vseed, rx, rz) !== null) hosted++;
      }
    }
    expect(hosted / total).toBeGreaterThan(0.35);
    expect(hosted / total).toBeLessThan(0.55);
  });

  it('keeps every centre inside its region with a 1-chunk margin', () => {
    // Margin 1 means the whole 3x3 member block stays inside the region,
    // so chunks never need to consult a neighbouring region.
    for (let rz = -16; rz < 16; rz++) {
      for (let rx = -16; rx < 16; rx++) {
        const c = villageCenterFor(vseed, rx, rz);
        if (c === null) continue;
        expect(c.cx - rx * VILLAGE_REGION).toBeGreaterThanOrEqual(1);
        expect(c.cx - rx * VILLAGE_REGION).toBeLessThanOrEqual(VILLAGE_REGION - 2);
        expect(c.cz - rz * VILLAGE_REGION).toBeGreaterThanOrEqual(1);
        expect(c.cz - rz * VILLAGE_REGION).toBeLessThanOrEqual(VILLAGE_REGION - 2);
      }
    }
  });
});

describe('villages in real worldgen', () => {
  // Pinned by scanning: for 'voxelheim-test', region (1, 2) hosts a village
  // centred on chunk (8, 16) whose chunk-centre biome is plains, so the
  // centre and its ring members actually build.
  const SEED = 'voxelheim-test';
  const vseed = cyrb128(`${SEED} villages`)[0];

  it('pins the scanned centre, resolvable from any member chunk', () => {
    expect(villageCenterFor(vseed, 1, 2)).toEqual({ cx: 8, cz: 16 });
    // A member chunk recovers the same centre from its own region coords
    // (floored division, exercising the negative-safe region math too).
    expect(villageCenterFor(vseed, Math.floor(7 / VILLAGE_REGION), Math.floor(15 / VILLAGE_REGION))).toEqual({
      cx: 8,
      cz: 16,
    });
    expect(villageCenterFor(vseed, -1, -1)?.cx ?? -99).toBeLessThan(0); // negative regions stay in range
  });

  it('builds the village heart in the centre chunk: hut, well and lamp post', () => {
    const gen = createGenerator(SEED);
    expect(gen.biomeAt(8 * CHUNK_SIZE + 8, 16 * CHUNK_SIZE + 8)).toBe(Biome.plains);
    const data = gen.generateChunk(8, 16);
    const counts = new Map<number, number>();
    for (let i = 0; i < data.length; i++) {
      if (i >> 8 > SEA_LEVEL) counts.set(data[i] ?? 0, (counts.get(data[i] ?? 0) ?? 0) + 1);
    }
    expect(counts.get(Block.lantern)).toBe(2); // hut lantern + lamp post
    expect(counts.get(Block.chest)).toBe(1); // the hut's chest
    expect(counts.get(Block.water)).toBe(2); // the well shaft, two deep
    expect(counts.get(Block.planks)).toBe(50); // hut floor + roof
    expect(data).toEqual(createGenerator(SEED).generateChunk(8, 16)); // byte-deterministic
  });

  it('builds ring members: a farm plot and a long house', () => {
    const gen = createGenerator(SEED);
    const tally = (cx: number, cz: number): Map<number, number> => {
      const data = gen.generateChunk(cx, cz);
      const counts = new Map<number, number>();
      for (let i = 0; i < data.length; i++) {
        if (i >> 8 > SEA_LEVEL) counts.set(data[i] ?? 0, (counts.get(data[i] ?? 0) ?? 0) + 1);
      }
      return counts;
    };
    // Member (8, 15) rolls a farm: 4 rows of 6 farmland, 12+12 crops, and
    // the 4-cell water channel behind its cobblestone caps.
    const farm = tally(8, 15);
    expect(farm.get(Block.farmland)).toBe(24);
    expect(farm.get(Block.cropGrowing)).toBe(12);
    expect(farm.get(Block.cropRipe)).toBe(12);
    expect(farm.get(Block.water)).toBe(4);
    // Member (7, 15) rolls a long house: two windows, a lantern, a chest.
    const hall = tally(7, 15);
    expect(hall.get(Block.glass)).toBe(2);
    expect(hall.get(Block.lantern)).toBe(1);
    expect(hall.get(Block.chest)).toBe(1);
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
