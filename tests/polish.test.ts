/**
 * v0.18 polish pack: weapon damage reaches every creature, species drop
 * their own rewards, skittish prey bolts from an approaching player, and
 * sunburnt stalkers visibly smoulder before the dawn takes them.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AnimalSystem, Species } from '../src/entities/animals';
import { HostileSystem } from '../src/entities/hostiles';
import { Block } from '../src/world/blocks';
import { Item } from '../src/world/items';

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

describe('weapon damage threading', () => {
  it('a heavy blow fells a stalker in fewer hits than fists', () => {
    const scene = new THREE.Scene();
    const sys = new HostileSystem(scene, mulberry32(3));
    sys.setWorld(flat);
    const s = sys.spawnAt(0.5, 10, 0.5);
    // Fist-scaled damage (2) leaves it alive; a Nightsever-scaled 67 doesn't.
    expect(sys.hurt(s, 0, 0, 2)).toBe(false);
    expect(sys.hurt(s, 0, 0, 67)).toBe(true);
  });

  it('animals accept a damage override and default to the old 1', () => {
    const scene = new THREE.Scene();
    const sys = new AnimalSystem(scene, mulberry32(5));
    sys.setWorld(flat);
    const a = sys.spawnAt(0.5, 10, 0.5, Species.trundler);
    expect(sys.hurt(a, 0, 0)).toBeNull(); // 1 damage: survives
    expect(sys.hurt(a, 0, 0, 99)).not.toBeNull(); // one-shot drop
  });
});

describe('species drops', () => {
  const drops = (species: number, roll: number): { id: number; count: number } | null => {
    const sys = new AnimalSystem(new THREE.Scene(), () => roll);
    sys.setWorld(flat);
    const a = sys.spawnAt(0.5, 10, 0.5, species as never);
    return sys.hurt(a, 0, 0, 99);
  };

  it('cinderpups bleed ember shards; stags feed a family', () => {
    expect(drops(Species.cinderpup, 0.9)).toEqual({ id: Item.emberShard, count: 1 });
    const stag = drops(Species.bramblehorn, 0.9);
    expect(stag?.id).toBe(Item.meat);
    expect(stag?.count).toBeGreaterThanOrEqual(2);
  });

  it('the weird trio sometimes carries a gem', () => {
    expect(drops(Species.puffle, 0.1)).toEqual({ id: Item.gem, count: 1 });
    expect(drops(Species.puffle, 0.9)?.id).toBe(Item.meat);
  });
});

describe('skittish prey', () => {
  it('a stag bolts when the player walks up to it', () => {
    const scene = new THREE.Scene();
    const sys = new AnimalSystem(scene, mulberry32(11));
    sys.setWorld(flat);
    sys.setSpawning(false);
    const stag = sys.spawnAt(2.5, 10, 0.5, Species.bramblehorn);
    const start = { x: stag.body.x, z: stag.body.z };
    // Player two blocks away: inside the flee radius.
    for (let i = 0; i < 90; i++) sys.fixedUpdate(1 / 60, 0.5, 10, 0.5);
    const fled = Math.hypot(stag.body.x - start.x, stag.body.z - start.z);
    expect(fled).toBeGreaterThan(1.5);
    // And it ran AWAY from the player, not through them.
    const before = Math.hypot(start.x - 0.5, start.z - 0.5);
    const after = Math.hypot(stag.body.x - 0.5, stag.body.z - 0.5);
    expect(after).toBeGreaterThan(before);
    // Placid trundlers stand their ground.
    const cow = sys.spawnAt(2.5, 10, 0.5, Species.trundler);
    const cowStart = { x: cow.body.x, z: cow.body.z };
    for (let i = 0; i < 30; i++) sys.fixedUpdate(1 / 60, 0.5, 10, 0.5);
    expect(Math.hypot(cow.body.x - cowStart.x, cow.body.z - cowStart.z)).toBeLessThan(1.5);
  });
});

describe('sunburn glow', () => {
  it('stalkers smoulder visibly while the sun burns them', () => {
    const scene = new THREE.Scene();
    const sys = new HostileSystem(scene, mulberry32(2));
    sys.setWorld(flat);
    const s = sys.spawnAt(0.5, 10, 0.5);
    // Two seconds of daylight: half-burnt, emissive visibly ramped.
    for (let i = 0; i < 120; i++) sys.fixedUpdate(1 / 60, 0.5, 144, 0.5, 1, () => {});
    expect(s.sunTimer).toBeGreaterThan(1);
    expect(s.mats[0]!.emissive.r).toBeGreaterThan(0.2);
  });
});
