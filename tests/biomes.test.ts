/**
 * Biomes: deterministic climate zoning and their effect on surfaces/trees.
 */
import { describe, expect, it } from 'vitest';
import { Biome, biomeName, createGenerator, SEA_LEVEL } from '../src/world/worldgen';
import { Block } from '../src/world/blocks';
import { blockIndex, CHUNK_SIZE } from '../src/world/chunk';

const gen = createGenerator('biome-seed');

describe('biome classification', () => {
  it('is deterministic per coordinate', () => {
    for (const [x, z] of [
      [0, 0],
      [123, -456],
      [9000, 9000],
    ] as const) {
      expect(gen.biomeAt(x, z)).toBe(gen.biomeAt(x, z));
    }
  });

  it('names every biome id', () => {
    for (const id of Object.values(Biome)) {
      expect(biomeName(id)).not.toBe('unknown');
    }
  });

  it('produces several distinct biomes across a wide region', () => {
    const seen = new Set<number>();
    for (let wz = -2000; wz <= 2000; wz += 64) {
      for (let wx = -2000; wx <= 2000; wx += 64) {
        seen.add(gen.biomeAt(wx, wz));
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
});

describe('biome surfaces and trees', () => {
  it('deserts are sandy and treeless above sea level', () => {
    let desertColumns = 0;
    let desertLogs = 0;
    for (let cz = -8; cz <= 8; cz++) {
      for (let cx = -8; cx <= 8; cx++) {
        // Quick reject: only scan chunks whose corner is desert-ish.
        const data = gen.generateChunk(cx, cz);
        for (let z = 0; z < CHUNK_SIZE; z++) {
          for (let x = 0; x < CHUNK_SIZE; x++) {
            const wx = cx * CHUNK_SIZE + x;
            const wz = cz * CHUNK_SIZE + z;
            if (gen.biomeAt(wx, wz) !== Biome.desert) continue;
            const h = gen.heightAt(wx, wz);
            if (h <= SEA_LEVEL + 1 || h > 96) continue; // skip beach/peak overrides
            desertColumns++;
            expect(data[blockIndex(x, h, z)]).toBe(Block.sand);
            for (let y = h + 1; y < 128; y++) {
              expect(data[blockIndex(x, y, z)]).not.toBe(Block.log);
            }
          }
        }
        for (let i = 0; i < data.length; i++) {
          if (data[i] === Block.log) {
            const x = i & 15;
            const z = (i >> 4) & 15;
            if (gen.biomeAt(cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z) === Biome.desert) desertLogs++;
          }
        }
      }
    }
    expect(desertColumns).toBeGreaterThan(0);
    expect(desertLogs).toBe(0);
  });

  it('forests carry more trees than plains for the same area', () => {
    const countLogs = (predicate: number): number => {
      let logs = 0;
      for (let cz = -8; cz <= 8; cz++) {
        for (let cx = -8; cx <= 8; cx++) {
          const data = gen.generateChunk(cx, cz);
          for (let i = 0; i < data.length; i++) {
            if (data[i] !== Block.log) continue;
            const x = i & 15;
            const z = (i >> 4) & 15;
            if (gen.biomeAt(cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z) === predicate) logs++;
          }
        }
      }
      return logs;
    };
    expect(countLogs(Biome.forest)).toBeGreaterThan(countLogs(Biome.plains));
  });
});
