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

  it('bakes a top-lit gradient into opaque tiles: stone row 0 brighter than row 15', () => {
    const px = generateAtlasPixels('s');
    const stone = tilePixels(px, Tiles.stone);
    const rowBrightness = (row: number): number => {
      let sum = 0;
      for (let x = 0; x < TILE_PX; x++) {
        const o = (row * TILE_PX + x) * 4;
        sum += (stone[o] ?? 0) + (stone[o + 1] ?? 0) + (stone[o + 2] ?? 0);
      }
      return sum / TILE_PX;
    };
    expect(rowBrightness(0)).toBeGreaterThan(rowBrightness(15));
  });

  it('draws mostly transparent crack tiles with strictly increasing density', () => {
    const px = generateAtlasPixels('s');
    const opaqueCount = (tile: number): number => {
      const t = tilePixels(px, tile);
      let opaque = 0;
      for (let i = 3; i < t.length; i += 4) {
        if (t[i] === 255) opaque++;
      }
      return opaque;
    };
    const c0 = opaqueCount(Tiles.crack0);
    const c1 = opaqueCount(Tiles.crack1);
    const c2 = opaqueCount(Tiles.crack2);
    const c3 = opaqueCount(Tiles.crack3);
    for (const c of [c0, c1, c2, c3]) {
      expect(c).toBeGreaterThan(0);
      expect(c).toBeLessThan((TILE_PX * TILE_PX) / 2); // mostly transparent
    }
    expect(c1).toBeGreaterThan(c0);
    expect(c2).toBeGreaterThan(c1);
    expect(c3).toBeGreaterThan(c2);
  });

  it('stays deterministic after the shading post-pass', () => {
    const a = generateAtlasPixels('post-pass-seed');
    const b = generateAtlasPixels('post-pass-seed');
    expect(a).toEqual(b);
  });

  it('computes flipped-Y UV rects', () => {
    const r = tileUVRect(0);
    expect(r.u0).toBe(0);
    expect(r.u1).toBe(1 / 16);
    expect(r.v1).toBe(1);
    expect(r.v0).toBe(15 / 16);
  });
});
