/**
 * Per-seed world spawn: deterministic per seed, varied across seeds, and
 * always dry, walkable land.
 */
import { describe, expect, it } from 'vitest';
import { findWorldSpawn } from '../src/world/spawn';
import { createGenerator, SEA_LEVEL } from '../src/world/worldgen';

describe('findWorldSpawn', () => {
  it('is deterministic per seed', () => {
    expect(findWorldSpawn('home')).toEqual(findWorldSpawn('home'));
  });

  it('lands different seeds in different places', () => {
    const spots = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const s = findWorldSpawn(`spawn-seed-${i}`);
      spots.add(`${s.x},${s.z}`);
    }
    expect(spots.size).toBeGreaterThanOrEqual(7);
  });

  it('always lands on dry land with feet just above the surface', () => {
    for (let i = 0; i < 12; i++) {
      const seed = `dryland-${i}`;
      const s = findWorldSpawn(seed);
      const gen = createGenerator(seed, 'overworld');
      const h = gen.heightAt(Math.floor(s.x), Math.floor(s.z));
      expect(s.y).toBe(h + 2);
      expect(h).toBeGreaterThanOrEqual(SEA_LEVEL + 2);
    }
  });
});
