/**
 * The underworld endgame: the Ashen Monarch and the Nightsever, the throne
 * hall, ashbloom flora, and the ash-born wildlife that only spawns below.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BOSS_SPECS, BossSystem, monarchLoot } from '../src/entities/boss';
import { AnimalSystem, Species, UNDERWORLD_SPECIES } from '../src/entities/animals';
import { buildThroneHall, createGenerator } from '../src/world/worldgen';
import { blockIndex, CHUNK_VOLUME } from '../src/world/chunk';
import { Block } from '../src/world/blocks';
import { Item } from '../src/world/items';

/** Deterministic PRNG (mulberry32) for spawn rolls. */
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

describe('the Ashen Monarch', () => {
  it('is the biggest, toughest boss — the end of the game', () => {
    const spec = BOSS_SPECS.ashenMonarch;
    for (const other of ['sunkenKing', 'stoneColossus', 'hollowTyrant'] as const) {
      expect(spec.hp).toBeGreaterThan(BOSS_SPECS[other].hp);
      expect(spec.height).toBeGreaterThan(BOSS_SPECS[other].height);
      expect(spec.slamDamage).toBeGreaterThan(BOSS_SPECS[other].slamDamage);
    }
    const sys = new BossSystem(new THREE.Scene(), () => 0.5);
    expect(sys.summon(0, 12, 0, 'ashenMonarch')).toBe(true);
    expect(sys.name).toBe('The Ashen Monarch');
  });

  it('always drops the Nightsever, the ash crown and two heartstones', () => {
    const drops = monarchLoot(() => 0.5);
    expect(drops.filter((d) => d.id === Item.nightsever).length).toBe(1);
    expect(drops.filter((d) => d.id === Item.ashcrown).length).toBe(1);
    expect(drops.filter((d) => d.id === Item.heartstone).length).toBe(2);
    expect(drops.filter((d) => d.id === Item.duskIngot).length).toBeGreaterThanOrEqual(6);
  });
});

describe('the throne hall', () => {
  it('raises a moated, battlemented castle around the blazing emberthrone', () => {
    const data = new Uint8Array(CHUNK_VOLUME);
    for (let i = 0; i < data.length; i++) data[i] = Block.ashstone;
    buildThroneHall(data, 10);
    expect(data[blockIndex(8, 12, 8)]).toBe(Block.emberthrone); // on the raised keep dais
    expect(data[blockIndex(8, 11, 8)]).toBe(Block.emberrock); // the dais itself
    expect(data[blockIndex(1, 10, 8)]).toBe(Block.lava); // the lava moat (edge ring 1)
    expect(data[blockIndex(2, 11, 8)]).toBe(Block.riftframe); // riftframe curtain wall (edge ring 2)
    expect(data[blockIndex(2, 18, 2)]).toBe(Block.emberrock); // corner tower cap
    expect(data[blockIndex(5, 12, 5)]).toBe(Block.emberrock); // inner ember pillar
    expect(data[blockIndex(8, 10, 1)]).toBe(Block.ashstone); // the drawbridge over the moat
    expect(data[blockIndex(8, 13, 9)]).toBe(Block.air); // cleared bailey
  });

  it('appears in generated underworld chunks (with ashblooms in the ash)', () => {
    const gen = createGenerator('throne census', 'underworld');
    let thrones = 0;
    let blooms = 0;
    for (let cx = 0; cx < 300; cx++) {
      const data = gen.generateChunk(cx, 5);
      for (let i = 0; i < data.length; i++) {
        if (data[i] === Block.emberthrone) thrones++;
        else if (data[i] === Block.ashbloom) blooms++;
      }
    }
    expect(thrones).toBeGreaterThan(0);
    expect(blooms).toBeGreaterThan(0);
  });
});

describe('ash-born wildlife', () => {
  it('spawns only underworld species on ashstone floors', () => {
    const scene = new THREE.Scene();
    const system = new AnimalSystem(scene, mulberry32(7));
    // An underworld-like floor: solid ashstone slab at y <= 9.
    system.setWorld({
      isSolid: (_x, y) => y <= 9,
      getBlock: (_x, y) => (y <= 9 ? Block.ashstone : Block.air),
    });
    system.setRealm('underworld');
    for (let i = 0; i < 60 * 20; i++) system.fixedUpdate(1 / 60, 0.5, 10, 0.5);
    expect(system.animals.length).toBeGreaterThan(0);
    for (const a of system.animals) {
      expect(UNDERWORLD_SPECIES).toContain(a.species);
    }
    // The same floor breeds nothing in overworld mode (no grass, no snow).
    const above = new AnimalSystem(scene, mulberry32(7));
    above.setWorld({
      isSolid: (_x, y) => y <= 9,
      getBlock: (_x, y) => (y <= 9 ? Block.ashstone : Block.air),
    });
    for (let i = 0; i < 60 * 20; i++) above.fixedUpdate(1 / 60, 0.5, 10, 0.5);
    expect(above.animals.length).toBe(0);
  });

  it('registers both ash species with ember-marked cinderpups', () => {
    expect(UNDERWORLD_SPECIES).toEqual([Species.cinderpup, Species.ashcrawler]);
  });
});
