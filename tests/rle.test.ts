import { describe, expect, it } from 'vitest';
import { decodeRLE, encodeRLE } from '../src/persist/rle';
import { CHUNK_VOLUME } from '../src/world/chunk';
import { createGenerator } from '../src/world/worldgen';
import { mulberry32 } from '../src/world/noise';

describe('RLE codec', () => {
  it('round-trips a uniform buffer in a single run', () => {
    const data = new Uint8Array(CHUNK_VOLUME); // all air
    const encoded = encodeRLE(data);
    expect(encoded.length).toBe(3);
    expect(decodeRLE(encoded, CHUNK_VOLUME)).toEqual(data);
  });

  it('round-trips the worst case: alternating ids', () => {
    const data = new Uint8Array(CHUNK_VOLUME);
    for (let i = 0; i < data.length; i++) data[i] = i % 2 === 0 ? 1 : 2;
    const encoded = encodeRLE(data);
    expect(encoded.length).toBe(CHUNK_VOLUME * 3); // one run per block
    expect(decodeRLE(encoded, CHUNK_VOLUME)).toEqual(data);
  });

  it('round-trips real generated chunks compactly', () => {
    const gen = createGenerator('rle-seed');
    for (const [cx, cz] of [
      [0, 0],
      [-7, 3],
    ] as const) {
      const data = gen.generateChunk(cx, cz);
      const encoded = encodeRLE(data);
      expect(decodeRLE(encoded, CHUNK_VOLUME)).toEqual(data);
      expect(encoded.length).toBeLessThan(CHUNK_VOLUME / 4); // sanity: it compresses
    }
  });

  it('round-trips random noise', () => {
    const rng = mulberry32(7);
    const data = new Uint8Array(4096);
    for (let i = 0; i < data.length; i++) data[i] = Math.floor(rng() * 14);
    expect(decodeRLE(encodeRLE(data), 4096)).toEqual(data);
  });

  it('splits runs longer than 65535', () => {
    const data = new Uint8Array(70000).fill(9);
    const encoded = encodeRLE(data);
    expect(encoded.length).toBe(6); // two runs
    expect(decodeRLE(encoded, 70000)).toEqual(data);
  });

  it('rejects malformed input', () => {
    expect(() => decodeRLE(new Uint8Array([1, 0]), 1)).toThrow(); // truncated triplet
    expect(() => decodeRLE(new Uint8Array([0, 0, 5]), 0)).toThrow(); // zero-length run
    expect(() => decodeRLE(new Uint8Array([2, 0, 5]), 1)).toThrow(); // overflow
    expect(() => decodeRLE(new Uint8Array([1, 0, 5]), 2)).toThrow(); // underflow
  });
});
