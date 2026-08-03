/**
 * Burrowers: the fourth hostile archetype — underground eruption spawns.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BURROWER_HP, HostileSystem } from '../src/entities/hostiles';
import { Block } from '../src/world/blocks';

const cave = {
  isSolid: (_x: number, y: number) => y <= 9,
  getBlock: (_x: number, y: number) => (y <= 9 ? Block.stone : Block.air),
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

describe('burrowers', () => {
  it('spawn buried, erupt over ~0.45s with dirt, then hunt', () => {
    const sys = new HostileSystem(new THREE.Scene(), mulberry32(6));
    sys.setWorld(cave);
    let dirt = 0;
    sys.onErupt = () => dirt++;
    const b = sys.spawnAt(0.5, 10, 0.5, false, false, false, true);
    expect(b.burrower).toBe(true);
    expect(b.hp).toBe(BURROWER_HP);
    expect(b.erupting).toBeGreaterThan(0);
    expect(b.group.scale.y).toBeLessThan(0.2); // still in the ground
    for (let i = 0; i < 40; i++) sys.fixedUpdate(1 / 60, 6.5, 10, 0.5, 0, () => {});
    expect(b.erupting).toBeLessThanOrEqual(0);
    expect(b.group.scale.y).toBe(1); // fully surfaced
    expect(dirt).toBeGreaterThan(0); // the eruption showered dirt
  });

  it('appear among underground spawns, close to the player', () => {
    const sys = new HostileSystem(new THREE.Scene(), mulberry32(21));
    sys.setWorld(cave);
    // Player deep underground (y=10 < 114): burrower rolls are live.
    for (let i = 0; i < 60 * 60; i++) sys.fixedUpdate(1 / 60, 0.5, 10, 0.5, 0, () => {});
    const burrowers = sys.stalkers.filter((s) => s.burrower);
    expect(burrowers.length).toBeGreaterThan(0); // eruptions joined the mix
  });
});
