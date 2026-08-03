/**
 * Per-seed world shape: each seed rolls a distinct terrain personality within
 * safe ranges, deterministically, and it feeds the generator.
 */
import { describe, expect, it } from 'vitest';
import { createGenerator, worldShapeOf } from '../src/world/worldgen';

describe('worldShapeOf', () => {
  it('is deterministic per seed', () => {
    expect(worldShapeOf('alpha')).toEqual(worldShapeOf('alpha'));
  });

  it('stays inside its documented ranges across many seeds', () => {
    for (let i = 0; i < 40; i++) {
      const s = worldShapeOf(`seed-${i}`);
      expect(s.continentScale).toBeGreaterThanOrEqual(400);
      expect(s.continentScale).toBeLessThanOrEqual(640);
      expect(s.mountainAmp).toBeGreaterThanOrEqual(34);
      expect(s.mountainAmp).toBeLessThanOrEqual(64);
      expect(s.hillAmp).toBeGreaterThanOrEqual(10);
      expect(s.hillAmp).toBeLessThanOrEqual(18);
      expect(s.treeMul).toBeGreaterThanOrEqual(0.7);
      expect(s.treeMul).toBeLessThanOrEqual(1.5);
      expect(Math.abs(s.tempBias)).toBeLessThanOrEqual(0.12);
      expect(Math.abs(s.moistBias)).toBeLessThanOrEqual(0.1);
    }
  });

  it('gives different seeds different personalities', () => {
    const shapes = new Set<string>();
    for (let i = 0; i < 12; i++) shapes.add(JSON.stringify(worldShapeOf(`world-${i}`)));
    expect(shapes.size).toBe(12);
  });

  it('feeds the generator: worlds stay deterministic and seeds diverge', () => {
    const a1 = createGenerator('shape-a').generateChunk(2, 2);
    const a2 = createGenerator('shape-a').generateChunk(2, 2);
    expect(a1).toEqual(a2);
    const b = createGenerator('shape-b').generateChunk(2, 2);
    expect(a1).not.toEqual(b);
  });
});
