/**
 * Deepholds: the buried mob villages. Covers the pure deepholdFor locator
 * (deterministic, bounded chance, carver-consistent coordinates) and the
 * tryCarveDeephold carver (halls carved with lights, chests and doorways;
 * stays untouched when the burial probe finds open air).
 */
import { describe, expect, it } from 'vitest';
import { deepholdFor, tryCarveDeephold } from '../src/world/worldgen';
import { blockIndex, CHUNK_SIZE, CHUNK_VOLUME } from '../src/world/chunk';
import { Block } from '../src/world/blocks';

/** A chunk of solid stone up to `topY` (bedrock floor) — deep-carve ground. */
function stoneChunk(topY: number): Uint8Array {
  const data = new Uint8Array(CHUNK_VOLUME);
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      data[blockIndex(x, 0, z)] = Block.bedrock;
      for (let y = 1; y <= topY; y++) data[blockIndex(x, y, z)] = Block.stone;
    }
  }
  return data;
}

/** Find a (seed, cx, cz) whose chunk hosts a deephold, plus its roll. */
function findHosted(): { seedInt: number; cx: number; cz: number; x: number; y: number; z: number } {
  for (let cx = 0; cx < 400; cx++) {
    const hit = deepholdFor(4242, cx, 7);
    if (hit) return { seedInt: 4242, cx, cz: 7, ...hit };
  }
  throw new Error('no deephold in 400 chunks — chance roll broken');
}

describe('deepholdFor', () => {
  it('is deterministic and rolls roughly 1-in-130 chunks', () => {
    const a = deepholdFor(999, 3, -2);
    expect(a).toEqual(deepholdFor(999, 3, -2));
    let hosted = 0;
    for (let i = 0; i < 2600; i++) {
      if (deepholdFor(999, i % 51, Math.floor(i / 51))) hosted++;
    }
    expect(hosted).toBeGreaterThan(5); // ~20 expected
    expect(hosted).toBeLessThan(60);
  });

  it('points inside the hosting chunk at a deep hall floor', () => {
    const { cx, cz, x, y, z } = findHosted();
    expect(x).toBeGreaterThanOrEqual(cx * CHUNK_SIZE);
    expect(x).toBeLessThan((cx + 1) * CHUNK_SIZE);
    expect(z).toBeGreaterThanOrEqual(cz * CHUNK_SIZE);
    expect(z).toBeLessThan((cz + 1) * CHUNK_SIZE);
    expect(y).toBeGreaterThanOrEqual(17); // DEEPHOLD_MIN_Y + 1
    expect(y).toBeLessThanOrEqual(31); // DEEPHOLD_MAX_Y + 1
  });
});

describe('tryCarveDeephold', () => {
  // The carver derives everything from the hash; hash 0 keeps the maths easy
  // (floor at DEEPHOLD_MIN_Y = 16, origin x0 = z0 = 1).
  const HASH = 0;
  const X0 = 1;
  const Z0 = 1;
  const Y0 = 16;

  it('carves the hall, chambers, doorways, lights and three chests', () => {
    const data = stoneChunk(90);
    tryCarveDeephold(data, HASH, X0, Z0);
    // Hall interior is air over a mossstone floor.
    expect(data[blockIndex(X0 + 4, Y0 + 2, Z0 + 6)]).toBe(Block.air);
    expect(data[blockIndex(X0 + 4, Y0, Z0 + 6)]).toBe(Block.mossstone);
    // Doorways punched through all three shared walls.
    expect(data[blockIndex(X0 + 4, Y0 + 1, Z0 + 3)]).toBe(Block.air);
    expect(data[blockIndex(X0 + 4, Y0 + 1, Z0 + 10)]).toBe(Block.air);
    expect(data[blockIndex(X0 + 9, Y0 + 1, Z0 + 6)]).toBe(Block.air);
    // Long-table planks, hanging lanterns, glowmoss, crystal.
    expect(data[blockIndex(X0 + 3, Y0 + 1, Z0 + 6)]).toBe(Block.planks);
    expect(data[blockIndex(X0 + 3, Y0 + 5, Z0 + 6)]).toBe(Block.lantern);
    expect(data[blockIndex(X0 + 3, Y0 + 1, Z0 + 12)]).toBe(Block.glowmoss);
    expect(data[blockIndex(X0 + 6, Y0 + 1, Z0 + 2)]).toBe(Block.crystal);
    // Three chests: hall, north chamber, east annex.
    expect(data[blockIndex(X0 + 1, Y0 + 1, Z0 + 9)]).toBe(Block.chest);
    expect(data[blockIndex(X0 + 6, Y0 + 1, Z0 + 12)]).toBe(Block.chest);
    expect(data[blockIndex(X0 + 12, Y0 + 1, Z0 + 5)]).toBe(Block.chest);
    // Bedrock at the world floor survives.
    expect(data[blockIndex(X0 + 4, 0, Z0 + 6)]).toBe(Block.bedrock);
  });

  it('bails without touching the chunk when cover is missing', () => {
    // Ground only up to y=20: the probe above the halls finds open air.
    const data = stoneChunk(20);
    const before = data.slice();
    tryCarveDeephold(data, HASH, X0, Z0);
    expect(data).toEqual(before);
  });
});
