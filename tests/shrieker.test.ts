/**
 * Shriekers: the third hostile archetype — pack-spawned, small, fast, fragile.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HostileSystem, SWIFT_HP, SWIFT_SCALE } from '../src/entities/hostiles';
import { Block } from '../src/world/blocks';

const flat = {
  isSolid: (_x: number, y: number) => y <= 9,
  getBlock: (_x: number, y: number) => (y <= 9 ? Block.grass : Block.air),
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('shriekers', () => {
  it('spawn small, fragile and melee-only, at swift scale', () => {
    const sys = new HostileSystem(new THREE.Scene(), mulberry32(4));
    sys.setWorld(flat);
    const s = sys.spawnAt(0.5, 10, 0.5, undefined, false, true);
    expect(s.swift).toBe(true);
    expect(s.ranged).toBe(false); // never spitters
    expect(s.hp).toBe(SWIFT_HP);
    expect(s.group.scale.x).toBeCloseTo(SWIFT_SCALE, 5);
    // Two nips fell it (fists deal 2 via the interaction scaling).
    expect(sys.hurt(s, 0, 0, 2)).toBe(true);
  });

  it('packs appear among night spawns (three at a time)', () => {
    const sys = new HostileSystem(new THREE.Scene(), mulberry32(11));
    sys.setWorld(flat);
    // Run many night ticks at the surface; some spawns roll shrieker packs.
    for (let i = 0; i < 60 * 60; i++) sys.fixedUpdate(1 / 60, 0.5, 144, 0.5, 0, () => {});
    const swifts = sys.stalkers.filter((s) => s.swift).length;
    expect(swifts).toBeGreaterThanOrEqual(3); // at least one full pack rolled
  });
});
