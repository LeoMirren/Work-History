/**
 * Graphics pass: depth-based cave darkness and foliage tinting.
 */
import { describe, expect, it } from 'vitest';
import {
  DEPTH_DARK_MIN,
  depthBrightness,
  foliageTint,
  meshChunk,
  PADDED_VOLUME,
  paddedIndex,
} from '../src/world/mesher';
import { Block } from '../src/world/blocks';

describe('depth brightness', () => {
  it('keeps open-sky faces fully lit and darkens with depth to a floor', () => {
    expect(depthBrightness(0)).toBe(1);
    expect(depthBrightness(-5)).toBe(1);
    expect(depthBrightness(1)).toBeCloseTo(0.955);
    expect(depthBrightness(10)).toBeCloseTo(0.55);
    expect(depthBrightness(100)).toBe(DEPTH_DARK_MIN);
  });

  it('darkens cave interiors relative to the surface in mesh output', () => {
    // Solid column 0..40 with an air pocket at y=20 — its faces are deep.
    const buf = new Uint8Array(PADDED_VOLUME);
    for (let y = 0; y <= 40; y++) {
      for (let px = 0; px < 18; px++) {
        for (let pz = 0; pz < 18; pz++) buf[paddedIndex(px, y, pz)] = Block.stone;
      }
    }
    buf[paddedIndex(9, 20, 9)] = Block.air;
    const mesh = meshChunk(buf, 0, 0).opaque!;
    const { positions, colors } = mesh;
    let caveFloor = -1;
    let surface = -1;
    for (let v = 0; v < positions.length / 3; v++) {
      const y = positions[v * 3 + 1] ?? 0;
      if (y === 20 && positions[v * 3]! >= 8 && positions[v * 3]! <= 9) caveFloor = colors[v * 3 + 1] ?? -1;
      if (y === 41) surface = colors[v * 3 + 1] ?? -1;
    }
    expect(surface).toBeCloseTo(1.0, 6);
    expect(caveFloor).toBeGreaterThan(0);
    expect(caveFloor).toBeLessThan(0.6); // ~20 blocks below cover
  });
});

describe('foliage tint', () => {
  it('is deterministic and bounded', () => {
    const a = foliageTint(123, -456);
    expect(foliageTint(123, -456)).toEqual(a);
    expect(a.r).toBeGreaterThan(0.9);
    expect(a.r).toBeLessThan(1.1);
    expect(a.b).toBeGreaterThan(0.8);
    expect(a.b).toBeLessThan(1.1);
  });

  it('varies across the world and tints grass in mesh output', () => {
    const tints = new Set<string>();
    for (let i = 0; i < 16; i++) {
      const t = foliageTint(i * 64, i * -32);
      tints.add(`${t.r.toFixed(4)},${t.b.toFixed(4)}`);
    }
    expect(tints.size).toBeGreaterThan(4);

    const buf = new Uint8Array(PADDED_VOLUME);
    buf[paddedIndex(9, 10, 9)] = Block.grass;
    const mesh = meshChunk(buf, 7, -3).opaque!;
    // Grass vertices: red and blue channels deviate from green (the tint).
    let tinted = 0;
    for (let v = 0; v < mesh.colors.length / 3; v++) {
      const r = mesh.colors[v * 3] ?? 0;
      const g = mesh.colors[v * 3 + 1] ?? 0;
      if (Math.abs(r - g) > 1e-6) tinted++;
    }
    expect(tinted).toBeGreaterThan(0);

    // Stone is never tinted.
    const stoneBuf = new Uint8Array(PADDED_VOLUME);
    stoneBuf[paddedIndex(9, 10, 9)] = Block.stone;
    const stone = meshChunk(stoneBuf, 7, -3).opaque!;
    for (let v = 0; v < stone.colors.length / 3; v++) {
      expect(stone.colors[v * 3]).toBeCloseTo(stone.colors[v * 3 + 1] ?? -1, 6);
    }
  });
});
