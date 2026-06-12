import { describe, expect, it } from 'vitest';
import { Block } from '../src/world/blocks';
import { blockIndex, CHUNK_SIZE } from '../src/world/chunk';
import { createGenerator, SEA_LEVEL } from '../src/world/worldgen';

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

  it('underwater columns are sand-floored and filled to sea level; land is grass/sand/snow', () => {
    let waterColumns = 0;
    let grassColumns = 0;
    for (let cz = -4; cz <= 4; cz++) {
      for (let cx = -4; cx <= 4; cx++) {
        const data = gen.generateChunk(cx, cz);
        for (let z = 0; z < CHUNK_SIZE; z++) {
          for (let x = 0; x < CHUNK_SIZE; x++) {
            const h = gen.heightAt(cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z);
            const surface = data[blockIndex(x, h, z)];
            if (h < SEA_LEVEL) {
              waterColumns++;
              expect(surface).toBe(Block.sand);
              for (let y = h + 1; y <= SEA_LEVEL; y++) {
                expect(data[blockIndex(x, y, z)]).toBe(Block.water);
              }
              expect(data[blockIndex(x, SEA_LEVEL + 1, z)]).toBe(Block.air);
            } else if (h >= SEA_LEVEL + 2) {
              if (surface === Block.grass) grassColumns++;
              // Tree trunks never replace the surface; snow only above 96.
              if (h > 96) expect(surface).toBe(Block.snow);
              else expect(surface).toBe(Block.grass);
            } else {
              expect(surface).toBe(Block.sand);
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
    for (let cz = -4; cz <= 4; cz++) {
      for (let cx = -4; cx <= 4; cx++) {
        const data = gen.generateChunk(cx, cz);
        for (let z = 0; z < CHUNK_SIZE; z++) {
          for (let x = 0; x < CHUNK_SIZE; x++) {
            const h = gen.heightAt(cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z);
            for (let y = 1; y <= h - 6 && y < h; y++) {
              if (data[blockIndex(x, y, z)] === Block.air) {
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
