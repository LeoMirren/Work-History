/**
 * The great bosses: phase thresholds, loot fountains, and the summon/hurt/
 * death lifecycle over a headless scene — for the Sunken King and the
 * roaming Stone Colossus alike.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bossPhase, bossLoot, colossusLoot, BossSystem, BOSS_HP, BOSS_SPECS } from '../src/entities/boss';
import { Item } from '../src/world/items';
import { Block } from '../src/world/blocks';

describe('bossPhase', () => {
  it('escalates as health drops (1 opener, 2 summoner, 3 enraged)', () => {
    expect(bossPhase(BOSS_HP, BOSS_HP)).toBe(1);
    expect(bossPhase(BOSS_HP * 0.7, BOSS_HP)).toBe(1);
    expect(bossPhase(BOSS_HP * 0.6, BOSS_HP)).toBe(2);
    expect(bossPhase(BOSS_HP * 0.34, BOSS_HP)).toBe(2);
    expect(bossPhase(BOSS_HP * 0.3, BOSS_HP)).toBe(3);
    expect(bossPhase(1, BOSS_HP)).toBe(3);
  });
});

describe('bossLoot', () => {
  it('always yields the crown and greataxe plus a burst of gems/gold', () => {
    const drops = bossLoot(() => 0.5);
    expect(drops.some((d) => d.id === Item.crown)).toBe(true);
    expect(drops.some((d) => d.id === Item.kingsplitter)).toBe(true);
    const gems = drops.filter((d) => d.id === Item.gem).length;
    const gold = drops.filter((d) => d.id === Item.goldIngot).length;
    expect(gems).toBeGreaterThanOrEqual(6);
    expect(gold).toBeGreaterThanOrEqual(8);
  });
});

describe('colossusLoot', () => {
  it('always yields the titan heart and earthshaker plus iron/gems/crystal', () => {
    const drops = colossusLoot(() => 0.5);
    expect(drops.some((d) => d.id === Item.titanHeart)).toBe(true);
    expect(drops.some((d) => d.id === Item.earthshaker)).toBe(true);
    expect(drops.filter((d) => d.id === Item.ingot).length).toBeGreaterThanOrEqual(8);
    expect(drops.filter((d) => d.id === Item.gem).length).toBeGreaterThanOrEqual(5);
    expect(drops.filter((d) => d.id === Block.crystal).length).toBeGreaterThanOrEqual(3);
  });
});

describe('the Stone Colossus', () => {
  const world = { isSolid: (_x: number, y: number) => y < 10, getBlock: () => 0 };

  it('is a bigger, tougher boss with its own name and hitbox', () => {
    const spec = BOSS_SPECS.stoneColossus;
    expect(spec.hp).toBeGreaterThan(BOSS_HP);
    expect(spec.height).toBeGreaterThan(BOSS_SPECS.sunkenKing.height);
    const scene = new THREE.Scene();
    const sys = new BossSystem(scene, () => 0.5);
    expect(sys.summon(0, 12, 0, 'stoneColossus')).toBe(true);
    expect(sys.name).toBe('The Stone Colossus');
    expect(sys.healthFraction).toBeCloseTo(1);
    expect(sys.halfWidth).toBe(spec.halfWidth);
    expect(sys.height).toBe(spec.height);
    // A ray at ~3.8 blocks up sails over the King but strikes the Colossus.
    expect(sys.raycastNearest(0.5, 12 + 3.8, -4, 0, 0, 1, 12)).not.toBeNull();
  });

  it('collapse drops its own hoard and reports the slain kind', () => {
    const scene = new THREE.Scene();
    const sys = new BossSystem(scene, () => 0.5);
    sys.summon(0, 12, 0, 'stoneColossus');
    let slain: string | null = null;
    sys.onSlain = (kind) => void (slain = kind);
    const loot: Array<{ id: number; count: number }> = [];
    const drop = (id: number, count: number): void => void loot.push({ id, count });
    const hit = sys.raycastNearest(0.5, 13, -4, 0, 0, 1, 12);
    expect(hit).not.toBeNull();
    if (hit) sys.hurt(hit.boss, BOSS_SPECS.stoneColossus.hp, 0, 0);
    expect(slain).toBe('stoneColossus');
    for (let i = 0; i < 20; i++) sys.fixedUpdate(0.1, world, 0.5, 12, 0.5, () => {}, () => {}, drop);
    expect(sys.active).toBe(false);
    expect(loot.some((d) => d.id === Item.titanHeart)).toBe(true);
    expect(loot.some((d) => d.id === Item.earthshaker)).toBe(true);
  });
});

describe('BossSystem lifecycle', () => {
  const world = { isSolid: (_x: number, y: number) => y < 10, getBlock: () => 0 };

  it('summons one boss and refuses a second while alive', () => {
    const scene = new THREE.Scene();
    const sys = new BossSystem(scene, () => 0.5);
    expect(sys.active).toBe(false);
    expect(sys.summon(0, 12, 0)).toBe(true);
    expect(sys.active).toBe(true);
    expect(sys.healthFraction).toBeCloseTo(1);
    expect(sys.summon(5, 12, 5)).toBe(false); // one at a time
  });

  it('slams the player in reach and drops the loot fountain on death', () => {
    const scene = new THREE.Scene();
    const sys = new BossSystem(scene, () => 0.5);
    sys.summon(0, 12, 0);
    let damageTaken = 0;
    const loot: Array<{ id: number; count: number }> = [];
    const hitPlayer = (d: number): void => void (damageTaken += d);
    const drop = (id: number, count: number): void => void loot.push({ id, count });
    // Player stands on top of the boss: within slam range after cooldown.
    for (let i = 0; i < 40; i++) sys.fixedUpdate(0.1, world, 0.5, 12, 0.5, hitPlayer, () => {}, drop);
    expect(damageTaken).toBeGreaterThan(0);

    // Kill it: one lethal blow, then let the collapse finish.
    const hit = sys.raycastNearest(0.5, 13, -3, 0, 0, 1, 12);
    expect(hit).not.toBeNull();
    if (hit) sys.hurt(hit.boss, BOSS_HP, 0, 0);
    for (let i = 0; i < 20; i++) sys.fixedUpdate(0.1, world, 0.5, 12, 0.5, hitPlayer, () => {}, drop);
    expect(sys.active).toBe(false);
    expect(loot.some((d) => d.id === Item.crown)).toBe(true);
  });

  it('summons adds only from phase 2 onward', () => {
    const scene = new THREE.Scene();
    const sys = new BossSystem(scene, () => 0.5);
    sys.summon(0, 12, 0);
    const boss = sys.raycastNearest(0.5, 13, -3, 0, 0, 1, 12)?.boss;
    expect(boss).toBeDefined();
    if (!boss) return;
    let adds = 0;
    const spawn = (): void => void (adds += 1);
    // Full health (phase 1): no adds across many ticks.
    for (let i = 0; i < 100; i++) sys.fixedUpdate(0.1, world, 20, 12, 20, () => {}, spawn, () => {});
    expect(adds).toBe(0);
    // Drop to phase 2 and run: adds appear.
    boss.hp = BOSS_HP * 0.5;
    for (let i = 0; i < 100; i++) sys.fixedUpdate(0.1, world, 20, 12, 20, () => {}, spawn, () => {});
    expect(adds).toBeGreaterThan(0);
  });
});
