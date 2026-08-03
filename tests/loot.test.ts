/**
 * Structure-chest loot: deterministic per (seed, position), bounded rolls,
 * and the first-open seeding contract with the container store.
 */
import { describe, expect, it } from 'vitest';
import { rollLoot } from '../src/world/loot';
import { ContainerStore } from '../src/world/containers';
import { Block } from '../src/world/blocks';

describe('rollLoot', () => {
  it('is deterministic for the same seed and position', () => {
    const a = rollLoot('world-1', 10, 62, -40);
    const b = rollLoot('world-1', 10, 62, -40);
    expect(a).toEqual(b);
  });

  it('varies across positions and seeds', () => {
    const hauls = new Set<string>();
    for (let i = 0; i < 20; i++) hauls.add(JSON.stringify(rollLoot('world-1', i * 37, 60, i * 91)));
    expect(hauls.size).toBeGreaterThan(1);
    expect(rollLoot('world-1', 5, 60, 5)).not.toEqual(rollLoot('world-2', 5, 60, 5));
  });

  it('rolls 3-6 stacks with sane counts', () => {
    for (let i = 0; i < 50; i++) {
      const stacks = rollLoot('bounds', i, 60, -i);
      expect(stacks.length).toBeGreaterThanOrEqual(3);
      expect(stacks.length).toBeLessThanOrEqual(6);
      for (const s of stacks) {
        expect(s.count).toBeGreaterThanOrEqual(1);
        expect(s.count).toBeLessThanOrEqual(8);
        expect(s.id).toBeGreaterThan(0);
      }
    }
  });
});

describe('first-open seeding contract', () => {
  it('worldgen chests have no entry until opened; placed chests do', () => {
    const store = new ContainerStore();
    // A worldgen chest exists in terrain bytes only — the store is unaware.
    expect(store.has(3, 62, 3)).toBe(false);
    // Opening (get) creates the entry the loot roll then fills.
    const chest = store.get(3, 62, 3);
    for (const s of rollLoot('world-1', 3, 62, 3)) chest.add(s.id, s.count);
    expect(store.has(3, 62, 3)).toBe(true);
    expect(chest.slots.some((slot) => slot !== null)).toBe(true);
    // A player-placed chest registers immediately, so it is never seeded.
    store.onBlockChanged('place', Block.chest, 8, 62, 8);
    expect(store.has(8, 62, 8)).toBe(true);
    expect(store.get(8, 62, 8).slots.every((slot) => slot === null)).toBe(true);
  });
});
