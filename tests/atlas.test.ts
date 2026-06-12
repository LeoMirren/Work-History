import { describe, expect, it } from 'vitest';
import {
  ATLAS_PX,
  generateAtlasPixels,
  LEAF_HOLE_CHANCE,
  TILE_PX,
  Tiles,
  tileUVRect,
  WATER_ALPHA,
} from '../src/engine/atlas';

function tilePixels(px: Uint8ClampedArray, tile: number): Uint8ClampedArray {
  const ox = (tile % 16) * TILE_PX;
  const oy = Math.floor(tile / 16) * TILE_PX;
  const out = new Uint8ClampedArray(TILE_PX * TILE_PX * 4);
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const src = ((oy + y) * ATLAS_PX + (ox + x)) * 4;
      const dst = (y * TILE_PX + x) * 4;
      out.set(px.subarray(src, src + 4), dst);
    }
  }
  return out;
}

describe('atlas generation', () => {
  it('is deterministic for the same seed', () => {
    const a = generateAtlasPixels('seed-alpha');
    const b = generateAtlasPixels('seed-alpha');
    expect(a).toEqual(b);
  });

  it('differs for a different seed', () => {
    const a = generateAtlasPixels('seed-alpha');
    const b = generateAtlasPixels('seed-beta');
    expect(a).not.toEqual(b);
  });

  it('bakes water alpha at 0.65', () => {
    const px = generateAtlasPixels('s');
    const water = tilePixels(px, Tiles.water);
    for (let i = 3; i < water.length; i += 4) {
      expect(water[i]).toBe(WATER_ALPHA);
    }
  });

  it('makes glass interior transparent and frame opaque', () => {
    const px = generateAtlasPixels('s');
    const glass = tilePixels(px, Tiles.glass);
    const alphaAt = (x: number, y: number): number => glass[(y * TILE_PX + x) * 4 + 3] ?? -1;
    expect(alphaAt(0, 0)).toBe(255);
    expect(alphaAt(15, 15)).toBe(255);
    expect(alphaAt(7, 7)).toBe(0);
    expect(alphaAt(8, 5)).toBe(0);
  });

  it('gives leaves roughly 15% transparent pixels', () => {
    const px = generateAtlasPixels('s');
    const leaves = tilePixels(px, Tiles.leaves);
    let holes = 0;
    for (let i = 3; i < leaves.length; i += 4) {
      if (leaves[i] === 0) holes++;
    }
    const ratio = holes / (TILE_PX * TILE_PX);
    expect(ratio).toBeGreaterThan(LEAF_HOLE_CHANCE - 0.08);
    expect(ratio).toBeLessThan(LEAF_HOLE_CHANCE + 0.08);
  });

  it('computes flipped-Y UV rects', () => {
    const r = tileUVRect(0);
    expect(r.u0).toBe(0);
    expect(r.u1).toBe(1 / 16);
    expect(r.v1).toBe(1);
    expect(r.v0).toBe(15 / 16);
  });
});
