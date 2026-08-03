/**
 * Companions & cataclysm: taming (collar, follow, protection) and the
 * Monarch's burning-floor hazards.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AnimalSystem, Species, TAMEABLE } from '../src/entities/animals';
import { BossSystem } from '../src/entities/boss';
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

const flat = {
  isSolid: (_x: number, y: number) => y <= 9,
  getBlock: (_x: number, y: number) => (y <= 9 ? Block.grass : Block.air),
};

describe('taming', () => {
  it('collars a tameable species, protects it, and it follows the player', () => {
    const sys = new AnimalSystem(new THREE.Scene(), mulberry32(3));
    sys.setWorld(flat);
    sys.setSpawning(false);
    const pup = sys.spawnAt(0.5, 10, 0.5, Species.mosshare);
    const children = pup.group.children.length;
    expect(TAMEABLE.has(pup.species)).toBe(true);
    expect(sys.tame(pup)).toBe(true);
    expect(pup.tamed).toBe(true);
    expect(pup.group.children.length).toBe(children + 1); // the collar
    expect(sys.tame(pup)).toBe(false); // already a friend
    // Protected: a lethal-grade swing only startles it.
    expect(sys.hurt(pup, 1, 0, 99)).toBeNull();
    expect(pup.dying).toBe(0);
    // Follows: player far away -> the companion closes the gap.
    const startDist = Math.hypot(pup.body.x - 12.5, pup.body.z - 0.5);
    for (let i = 0; i < 60 * 6; i++) sys.fixedUpdate(1 / 60, 12.5, 10, 0.5);
    const endDist = Math.hypot(pup.body.x - 12.5, pup.body.z - 0.5);
    expect(endDist).toBeLessThan(startDist - 3);
    // Never despawns by distance; blinks to the player when hopelessly far.
    sys.fixedUpdate(1 / 60, 500, 10, 500);
    expect(sys.animals.includes(pup)).toBe(true);
    expect(Math.hypot(pup.body.x - 500, pup.body.z - 500)).toBeLessThan(4);
  });

  it('refuses non-tameable species', () => {
    const sys = new AnimalSystem(new THREE.Scene(), mulberry32(5));
    sys.setWorld(flat);
    sys.setSpawning(false);
    const cow = sys.spawnAt(0.5, 10, 0.5, Species.trundler);
    expect(sys.tame(cow)).toBe(false);
    expect(cow.tamed).toBe(false);
  });
});

describe('Monarch ember hazards', () => {
  const world = { isSolid: (_x: number, y: number) => y < 10, getBlock: () => 0 };

  it('slams leave burning patches from phase 2 that tick damage', () => {
    const sys = new BossSystem(new THREE.Scene(), () => 0.5);
    sys.summon(0, 12, 0, 'ashenMonarch');
    const b = sys.raycastNearest(0.5, 13, -4, 0, 0, 1, 12)!.boss;
    b.hp = b.spec.hp * 0.5; // phase 2
    let damage = 0;
    let motes = 0;
    sys.onHazard = () => motes++;
    // Stand in slam range until a windup resolves and the patch ignites.
    for (let i = 0; i < 40; i++) sys.fixedUpdate(0.1, world, 0.5, 12, 0.5, (d) => (damage += d), () => {}, () => {});
    expect(damage).toBeGreaterThan(0); // the slam itself
    expect(motes).toBeGreaterThan(0); // the patch smoulders visibly
  });
});
