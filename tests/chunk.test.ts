import { describe, expect, it } from 'vitest';
import {
  blockIndex,
  CHUNK_HEIGHT,
  CHUNK_SIZE,
  CHUNK_VOLUME,
  chunkCoord,
  createChunkData,
  indexToLocal,
  localCoord,
} from '../src/world/chunk';

describe('chunk index math', () => {
  it('round-trips every one of the 32,768 cells uniquely', () => {
    const seen = new Uint8Array(CHUNK_VOLUME);
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const i = blockIndex(x, y, z);
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(CHUNK_VOLUME);
          expect(seen[i]).toBe(0);
          seen[i] = 1;
          const back = indexToLocal(i);
          expect(back).toEqual({ x, y, z });
        }
      }
    }
    expect(seen.every((v) => v === 1)).toBe(true);
  });

  it('matches the spec formula i = x + (z<<4) + (y<<8)', () => {
    expect(blockIndex(5, 7, 3)).toBe(5 + (3 << 4) + (7 << 8));
    expect(blockIndex(15, 127, 15)).toBe(CHUNK_VOLUME - 1);
    expect(blockIndex(0, 0, 0)).toBe(0);
  });

  it('maps world coords to chunk/local coords, including negatives', () => {
    expect(chunkCoord(0)).toBe(0);
    expect(chunkCoord(15)).toBe(0);
    expect(chunkCoord(16)).toBe(1);
    expect(chunkCoord(-1)).toBe(-1);
    expect(chunkCoord(-16)).toBe(-1);
    expect(chunkCoord(-17)).toBe(-2);
    expect(localCoord(-1)).toBe(15);
    expect(localCoord(-16)).toBe(0);
    expect(localCoord(31)).toBe(15);
  });

  it('allocates zeroed (all-air) chunk data', () => {
    const data = createChunkData();
    expect(data.length).toBe(CHUNK_VOLUME);
    expect(data.every((v) => v === 0)).toBe(true);
  });
});
