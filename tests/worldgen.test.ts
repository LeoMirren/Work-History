import { describe, expect, it } from 'vitest';
import { Block } from '../src/world/blocks';
import { blockIndex, CHUNK_HEIGHT, CHUNK_SIZE } from '../src/world/chunk';
import {
  Biome,
  biomeName,
  createGenerator,
  findSafeSpawnY,
  SEA_LEVEL,
  VILLAGE_RADIUS,
  VILLAGE_REGION,
  villageCenterFor,
} from '../src/world/worldgen';
import { cyrb128 } from '../src/world/noise';

function fnv1a(data: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i] ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const SEED = 'voxelheim-test';

describe('worldgen determinism', () => {
  it('same seed + same chunk coords -> byte-identical chunks', () => {
    const a = createGenerator(SEED);
    const b = createGenerator(SEED);
    for (const [cx, cz] of [
      [0, 0],
      [-3, 7],
      [12, -5],
      [100, 100],
    ] as const) {
      const ca = a.generateChunk(cx, cz);
      const cb = b.generateChunk(cx, cz);
      expect(fnv1a(ca)).toBe(fnv1a(cb));
      expect(ca).toEqual(cb);
    }
  });

  it('different seed -> different chunks', () => {
    const a = createGenerator(SEED).generateChunk(0, 0);
    const b = createGenerator('another-seed').generateChunk(0, 0);
    expect(fnv1a(a)).not.toBe(fnv1a(b));
  });

  it('generation order does not matter', () => {
    const g1 = createGenerator(SEED);
    const first = g1.generateChunk(2, 2);
    g1.generateChunk(5, 5);
    const again = g1.generateChunk(2, 2);
    expect(again).toEqual(first);
  });
});

describe('worldgen content rules', () => {
  const gen = createGenerator(SEED);

  it('y=0 is always bedrock', () => {
    for (const [cx, cz] of [
      [0, 0],
      [-2, 3],
      [9, -9],
    ] as const) {
      const data = gen.generateChunk(cx, cz);
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          expect(data[blockIndex(x, 0, z)]).toBe(Block.bedrock);
        }
      }
    }
  });

  it('floods oceans, sands beaches/peaks, and lays biome surfaces on land', () => {
    let waterColumns = 0;
    let grassColumns = 0;
    // Villages overlay roads/plazas/buildings on the natural surface; skip
    // their member chunks so this test stays about the terrain rules.
    const villageSeedInt = cyrb128(`${SEED} villages`)[0];
    const isVillageChunk = (cx: number, cz: number): boolean => {
      const vc = villageCenterFor(villageSeedInt, Math.floor(cx / VILLAGE_REGION), Math.floor(cz / VILLAGE_REGION));
      return vc !== null && Math.max(Math.abs(cx - vc.cx), Math.abs(cz - vc.cz)) <= VILLAGE_RADIUS;
    };
    for (let cz = -4; cz <= 4; cz++) {
      for (let cx = -4; cx <= 4; cx++) {
        if (isVillageChunk(cx, cz)) continue;
        const data = gen.generateChunk(cx, cz);
        for (let z = 0; z < CHUNK_SIZE; z++) {
          for (let x = 0; x < CHUNK_SIZE; x++) {
            const wx = cx * CHUNK_SIZE + x;
            const wz = cz * CHUNK_SIZE + z;
            const h = gen.heightAt(wx, wz);
            const surface = data[blockIndex(x, h, z)];
            if (h < SEA_LEVEL) {
              waterColumns++;
              expect(surface).toBe(Block.sand);
              for (let y = h + 1; y <= SEA_LEVEL; y++) {
                const id = data[blockIndex(x, y, z)] ?? 0;
                // Reef décor may sprout 1-2 cells off the floor; water above.
                if (y <= h + 2) {
                  expect([Block.water, Block.seagrass, Block.coralRose, Block.coralTeal]).toContain(id);
                } else {
                  expect(id).toBe(Block.water);
                }
              }
              expect(data[blockIndex(x, SEA_LEVEL + 1, z)]).toBe(Block.air);
            } else if (h <= SEA_LEVEL + 1) {
              expect(surface).toBe(Block.sand); // beach band
            } else if (h > 96) {
              expect(surface).toBe(Block.snow); // peaks
            } else {
              // Biome surface: grass (plains/forest/savanna), sand (desert)
              // or snow (snowy). Trees never replace the surface block.
              if (surface === Block.grass) grassColumns++;
              expect([Block.grass, Block.sand, Block.snow]).toContain(surface);
            }
          }
        }
      }
    }
    expect(waterColumns).toBeGreaterThan(0);
    expect(grassColumns).toBeGreaterThan(0);
  });

  it('carves caves but never under low/ocean columns', () => {
    let caveAir = 0;
    /** True if a crystal/geodeshell sits within radius 5 — i.e., sealed geode air. */
    const nearGeode = (data: Uint8Array, x: number, y: number, z: number): boolean => {
      for (let dy = -5; dy <= 5; dy++) {
        const yy = y + dy;
        if (yy < 1 || yy >= CHUNK_HEIGHT) continue;
        for (let dz = -5; dz <= 5; dz++) {
          for (let dx = -5; dx <= 5; dx++) {
            const xx = x + dx;
            const zz = z + dz;
            if (xx < 0 || xx > 15 || zz < 0 || zz > 15) continue;
            const id = data[blockIndex(xx, yy, zz)];
            if (id === Block.crystal || id === Block.geodeshell) return true;
          }
        }
      }
      return false;
    };
    for (let cz = -4; cz <= 4; cz++) {
      for (let cx = -4; cx <= 4; cx++) {
        const data = gen.generateChunk(cx, cz);
        for (let z = 0; z < CHUNK_SIZE; z++) {
          for (let x = 0; x < CHUNK_SIZE; x++) {
            const h = gen.heightAt(cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z);
            for (let y = 1; y <= h - 6 && y < h; y++) {
              if (data[blockIndex(x, y, z)] === Block.air && !nearGeode(data, x, y, z)) {
                caveAir++;
                expect(h).toBeGreaterThanOrEqual(SEA_LEVEL + 2);
                expect(y).toBeGreaterThanOrEqual(5);
              }
            }
          }
        }
      }
    }
    expect(caveAir).toBeGreaterThan(0);
  });

  it('seeds layered ore veins within their depth bands', () => {
    const counts = new Map<number, number>();
    const maxY = new Map<number, number>();
    const bands: Array<[number, number]> = [
      [Block.coalOre, 90],
      [Block.ore, 60],
      [Block.copperOre, 46],
      [Block.goldOre, 28],
    ];
    for (let cz = -4; cz <= 4; cz++) {
      for (let cx = -4; cx <= 4; cx++) {
        const data = gen.generateChunk(cx, cz);
        for (let i = 0; i < data.length; i++) {
          const id = data[i] ?? 0;
          for (const [ore] of bands) {
            if (id === ore) {
              counts.set(ore, (counts.get(ore) ?? 0) + 1);
              const y = i >> 8;
              expect(y).toBeGreaterThanOrEqual(5);
              maxY.set(ore, Math.max(maxY.get(ore) ?? 0, y));
            }
          }
        }
      }
    }
    // Every ore appears, each within its own band, and rarity is ordered.
    for (const [ore, top] of bands) {
      expect(counts.get(ore) ?? 0).toBeGreaterThan(0);
      expect(maxY.get(ore) ?? 0).toBeLessThanOrEqual(top);
    }
    expect(counts.get(Block.coalOre)!).toBeGreaterThan(counts.get(Block.goldOre)!); // coal common, gold rare
  });

  it('plants trees only inside the canopy margin, with leaves around trunk tops', () => {
    let logs = 0;
    let leaves = 0;
    for (let cz = -4; cz <= 4; cz++) {
      for (let cx = -4; cx <= 4; cx++) {
        const data = gen.generateChunk(cx, cz);
        for (let i = 0; i < data.length; i++) {
          if (data[i] === Block.log) {
            logs++;
            const x = i & 15;
            const z = (i >> 4) & 15;
            expect(x).toBeGreaterThanOrEqual(2);
            expect(x).toBeLessThanOrEqual(13);
            expect(z).toBeGreaterThanOrEqual(2);
            expect(z).toBeLessThanOrEqual(13);
          } else if (data[i] === Block.leaves) {
            leaves++;
          }
        }
      }
    }
    expect(logs).toBeGreaterThan(0);
    expect(leaves).toBeGreaterThan(logs); // canopies dwarf trunks
  });
});

describe('underworld dimension', () => {
  it('is deterministic for the same seed + coords', () => {
    const a = createGenerator(SEED, 'underworld');
    const b = createGenerator(SEED, 'underworld');
    for (const [cx, cz] of [
      [0, 0],
      [-3, 5],
      [9, -2],
    ] as const) {
      expect(a.generateChunk(cx, cz)).toEqual(b.generateChunk(cx, cz));
    }
    expect(a.dimension).toBe('underworld');
  });

  it('differs from the overworld and from a different seed', () => {
    const uw = createGenerator(SEED, 'underworld').generateChunk(0, 0);
    const ow = createGenerator(SEED, 'overworld').generateChunk(0, 0);
    expect(uw).not.toEqual(ow);
    const uw2 = createGenerator('other-seed', 'underworld').generateChunk(0, 0);
    expect(uw).not.toEqual(uw2);
  });

  it('is an enclosed ashstone realm: bedrock cap/floor, open caverns, ember light, no water', () => {
    const gen = createGenerator(SEED, 'underworld');
    let ashstone = 0;
    let ember = 0;
    let air = 0;
    let water = 0;
    for (let cz = -2; cz <= 2; cz++) {
      for (let cx = -2; cx <= 2; cx++) {
        const data = gen.generateChunk(cx, cz);
        for (let z = 0; z < CHUNK_SIZE; z++) {
          for (let x = 0; x < CHUNK_SIZE; x++) {
            // Bedrock floor and ceiling enclose every column.
            expect(data[blockIndex(x, 0, z)]).toBe(Block.bedrock);
            expect(data[blockIndex(x, 127, z)]).toBe(Block.bedrock);
            for (let y = 0; y < CHUNK_HEIGHT; y++) {
              const id = data[blockIndex(x, y, z)];
              if (id === Block.ashstone) ashstone++;
              else if (id === Block.emberrock) ember++;
              else if (id === Block.air) air++;
              else if (id === Block.water) water++;
            }
          }
        }
      }
    }
    expect(ashstone).toBeGreaterThan(0);
    expect(ember).toBeGreaterThan(0); // light sources present
    expect(air).toBeGreaterThan(0); // caverns to walk through
    expect(water).toBe(0); // no water down here
  });
});

describe('portal landing (findSafeSpawnY)', () => {
  it('returns an in-range, deterministic landing for both dimensions', () => {
    for (const dim of ['overworld', 'underworld'] as const) {
      for (const [wx, wz] of [
        [0, 0],
        [37, -52],
        [-100, 8],
      ] as const) {
        const y = findSafeSpawnY(SEED, dim, wx, wz);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(127);
        expect(findSafeSpawnY(SEED, dim, wx, wz)).toBe(y); // deterministic
      }
    }
  });

  it('lands on solid ground with headroom over dry land', () => {
    const gen = createGenerator(SEED, 'overworld');
    let landTested = 0;
    // Scan a swath for land columns (above sea level) and verify the invariant.
    for (let wx = -40; wx <= 40 && landTested < 5; wx += 7) {
      for (let wz = -40; wz <= 40 && landTested < 5; wz += 7) {
        if (gen.heightAt(wx, wz) < SEA_LEVEL + 3) continue; // skip ocean/beach
        const y = findSafeSpawnY(SEED, 'overworld', wx, wz);
        const data = gen.generateChunk(Math.floor(wx / CHUNK_SIZE), Math.floor(wz / CHUNK_SIZE));
        const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        expect(data[blockIndex(lx, y - 1, lz)]).not.toBe(Block.air); // solid below
        expect(data[blockIndex(lx, y, lz)]).toBe(Block.air); // feet
        expect(data[blockIndex(lx, y + 1, lz)]).toBe(Block.air); // head
        landTested++;
      }
    }
    expect(landTested).toBeGreaterThan(0);
  });
});

describe('geodes', () => {
  it('generates crystal-lined geodes deep underground, deterministically', () => {
    const gen = createGenerator(SEED, 'overworld');
    let crystal = 0;
    let shell = 0;
    let minCrystalY = 128;
    let maxCrystalY = 0;
    for (let cz = -8; cz <= 8; cz++) {
      for (let cx = -8; cx <= 8; cx++) {
        const data = gen.generateChunk(cx, cz);
        for (let i = 0; i < data.length; i++) {
          if (data[i] === Block.crystal) {
            crystal++;
            const y = i >> 8;
            minCrystalY = Math.min(minCrystalY, y);
            maxCrystalY = Math.max(maxCrystalY, y);
          } else if (data[i] === Block.geodeshell) {
            shell++;
          }
        }
      }
    }
    expect(crystal).toBeGreaterThan(0);
    expect(shell).toBeGreaterThan(0);
    expect(minCrystalY).toBeGreaterThanOrEqual(1);
    expect(maxCrystalY).toBeLessThan(50); // deep underground
    // Determinism: same chunk regenerates identically.
    expect(gen.generateChunk(3, -5)).toEqual(createGenerator(SEED, 'overworld').generateChunk(3, -5));
  });
});

describe('jungle biome', () => {
  it('names jungle and exposes a dense-tree def', () => {
    expect(biomeName(Biome.jungle)).toBe('jungle');
  });

  it('appears somewhere and grows tall dense trees', () => {
    const gen = createGenerator(SEED);
    // Find a chunk that contains jungle columns by scanning a wide area.
    let jungleChunk: [number, number] | null = null;
    for (let cz = -16; cz <= 16 && !jungleChunk; cz++) {
      for (let cx = -16; cx <= 16 && !jungleChunk; cx++) {
        let count = 0;
        for (let z = 0; z < CHUNK_SIZE; z += 4) {
          for (let x = 0; x < CHUNK_SIZE; x += 4) {
            if (gen.biomeAt(cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z) === Biome.jungle) count++;
          }
        }
        if (count >= 4) jungleChunk = [cx, cz];
      }
    }
    expect(jungleChunk).not.toBeNull();

    // Trees grow there (dense biome), with at least one trunk 7+ tall.
    let maxTrunk = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const data = gen.generateChunk(jungleChunk![0] + dx, jungleChunk![1] + dz);
        // Measure a trunk height by counting vertical logs over a column.
        for (let z = 0; z < CHUNK_SIZE; z++) {
          for (let x = 0; x < CHUNK_SIZE; x++) {
            let run = 0;
            for (let y = 1; y < CHUNK_HEIGHT; y++) {
              if (data[blockIndex(x, y, z)] === Block.log) run++;
              else if (run > 0) break;
            }
            maxTrunk = Math.max(maxTrunk, run);
          }
        }
      }
    }
    expect(maxTrunk).toBeGreaterThanOrEqual(7); // jungle trunks are tall
  });
});
