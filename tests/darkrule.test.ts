/**
 * The Rule of the Dark: placed light sources ward off ALL hostile spawns.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HostileSystem } from '../src/entities/hostiles';
import { Block } from '../src/world/blocks';

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

describe('light-warded spawning', () => {
  it('a torch-studded field spawns nothing; the dark field crawls', () => {
    // Dark world: plain grass slab.
    const dark = new HostileSystem(new THREE.Scene(), mulberry32(8));
    dark.setWorld({
      isSolid: (_x, y) => y <= 9,
      getBlock: (_x, y) => (y <= 9 ? Block.grass : Block.air),
    });
    for (let i = 0; i < 60 * 40; i++) dark.fixedUpdate(1 / 60, 0.5, 144, 0.5, 0, () => {});
    expect(dark.count).toBeGreaterThan(0);

    // Lit world: same slab, but torches stud the surface every 8 blocks —
    // every spawn candidate sits within the 7-block ward of some torch.
    const lit = new HostileSystem(new THREE.Scene(), mulberry32(8));
    lit.setWorld({
      isSolid: (_x, y) => y <= 9,
      getBlock: (x, y, z) => {
        if (y <= 9) return Block.grass;
        if (y === 10 && ((x % 8) + 8) % 8 === 0 && ((z % 8) + 8) % 8 === 0) return Block.torch;
        return Block.air;
      },
    });
    for (let i = 0; i < 60 * 40; i++) lit.fixedUpdate(1 / 60, 0.5, 144, 0.5, 0, () => {});
    expect(lit.count).toBe(0); // the light holds
  });
});
