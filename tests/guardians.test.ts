/**
 * Dungeon guardians ("vault brutes"): locator-driven pack spawning tagged to
 * nearby dungeons, lurk-radius aggro with cooled-down heavy melee, leashing
 * back to the vault centre, resisted knockback, rng-rolled death loot that
 * frees the slot for respawn, ray-picking, and the shrinking death pop.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  GuardianSystem,
  GUARDIAN_HP,
  type DungeonLocator,
  type Guardian,
} from '../src/entities/guardians';
import { Item } from '../src/world/items';
import { mulberry32 } from '../src/world/noise';
import { Block } from '../src/world/blocks';
import type { WorldView } from '../src/player/controller';

const DT = 1 / 60;
const noDamage = (): void => {};

/** Solid floor below y=10 (stone), open air above — a bare vault chamber. */
const vaultWorld: WorldView = {
  isSolid: (_x, y, _z) => y <= 9,
  getBlock: (_x, y, _z) => (y <= 9 ? Block.stone : Block.air),
};

/** One dungeon in chunk (0,0), room centre on the open floor at (8, 10, 8). */
const CENTRE = { x: 8, y: 10, z: 8 };
const oneDungeon: DungeonLocator = (cx, cz) => (cx === 0 && cz === 0 ? CENTRE : null);
const noDungeon: DungeonLocator = () => null;

function makeSystem(
  locator: DungeonLocator = oneDungeon,
  random: () => number = mulberry32(7),
): { system: GuardianSystem; scene: THREE.Scene } {
  const scene = new THREE.Scene();
  const system = new GuardianSystem(scene, locator, random);
  system.setWorld(vaultWorld);
  return { system, scene };
}

/** Land GUARDIAN_HP/2 blows; returns the loot yielded by the lethal one. */
function kill(system: GuardianSystem, g: Guardian): { id: number; count: number } | null {
  let loot: { id: number; count: number } | null = null;
  for (let i = 0; i < GUARDIAN_HP / 2; i++) loot = system.hurt(g);
  return loot;
}

describe('guardian spawning', () => {
  it('keeps exactly 2 brutes alive, tagged to the nearby dungeon', () => {
    const { system } = makeSystem();
    for (let i = 0; i < 60 * 5; i++) system.fixedUpdate(DT, 8.5, 10, 8.5, noDamage);
    expect(system.count).toBe(2); // a pair, never more, across many scans
    expect(system.guardians.every((g) => g.key === '0,0')).toBe(true);
    // Each stands feet-down on a floor column near the room centre.
    for (const g of system.guardians) {
      expect(g.body.y).toBe(10);
      expect(Math.abs(g.body.x - CENTRE.x)).toBeLessThanOrEqual(3.5);
      expect(Math.abs(g.body.z - CENTRE.z)).toBeLessThanOrEqual(3.5);
    }
  });

  it('spawns none when no dungeon is near', () => {
    const far = makeSystem(); // dungeon exists but the player is 200+ away
    for (let i = 0; i < 60 * 3; i++) far.system.fixedUpdate(DT, 200.5, 10, 200.5, noDamage);
    expect(far.system.count).toBe(0);

    const none = makeSystem(noDungeon); // no dungeon at all
    for (let i = 0; i < 60 * 3; i++) none.system.fixedUpdate(DT, 8.5, 10, 8.5, noDamage);
    expect(none.system.count).toBe(0);
  });

  it('skips dungeons whose centre is beyond 40 blocks even in scanned chunks', () => {
    const { system } = makeSystem();
    // Player chunk (3,0): chunk (0,0) is Chebyshev 3, but the centre is ~52 away.
    for (let i = 0; i < 60 * 3; i++) system.fixedUpdate(DT, 60.5, 10, 8.5, noDamage);
    expect(system.count).toBe(0);
  });

  it('skips spawning when no solid-with-2-air column fits near the centre', () => {
    const airborne: DungeonLocator = (cx, cz) =>
      cx === 0 && cz === 0 ? { x: 8, y: 50, z: 8 } : null; // mid-air, no floor in band
    const { system } = makeSystem(airborne);
    for (let i = 0; i < 60 * 3; i++) system.fixedUpdate(DT, 8.5, 50, 8.5, noDamage);
    expect(system.count).toBe(0);
  });

  it('despawns the pack when the player leaves the dungeon far behind', () => {
    const { system } = makeSystem();
    system.fixedUpdate(DT, 8.5, 10, 8.5, noDamage);
    expect(system.count).toBe(2);
    system.fixedUpdate(DT, 120.5, 10, 8.5, noDamage); // > 60 from the vault
    expect(system.count).toBe(0);
  });

  it('clears on world reset', () => {
    const { system } = makeSystem();
    system.fixedUpdate(DT, 8.5, 10, 8.5, noDamage);
    expect(system.count).toBe(2);
    system.setWorld(null);
    expect(system.count).toBe(0);
    system.fixedUpdate(DT, 8.5, 10, 8.5, noDamage); // worldless: inert
    expect(system.count).toBe(0);
  });
});

describe('guardian behaviour', () => {
  it('lurks (idle wander) beyond 14 but closes on intruders inside it', () => {
    const { system } = makeSystem(noDungeon);
    // 20 blocks out: no aggro — a slow wander never closes the gap much.
    const idle = system.spawnAt(20.5, 10, 0.5, 'a', { x: 20.5, y: 10, z: 0.5 });
    for (let i = 0; i < 60 * 2; i++) system.fixedUpdate(DT, 0.5, 10, 0.5, noDamage);
    expect(Math.hypot(idle.body.x - 0.5, idle.body.z - 0.5)).toBeGreaterThan(16);

    // 10 blocks out: aggro — it marches at the player.
    const brute = system.spawnAt(0.5, 10, 10.5, 'b', { x: 0.5, y: 10, z: 10.5 });
    for (let i = 0; i < 60 * 3; i++) system.fixedUpdate(DT, 0.5, 10, 0.5, noDamage);
    expect(Math.hypot(brute.body.x - 0.5, brute.body.z - 0.5)).toBeLessThan(6);
  });

  it('telegraphs melee: the tell runs ~0.35s BEFORE hitPlayer(3) lands', () => {
    const { system } = makeSystem(noDungeon);
    const g = system.spawnAt(2.0, 10, 0.5, 'a', { x: 2, y: 10, z: 0.5 });
    const damages: number[] = [];
    // During the windup: the torso tips (the tell) but NO damage yet.
    for (let i = 0; i < 12; i++) system.fixedUpdate(DT, 0.5, 10, 0.5, (d) => damages.push(d));
    expect(damages).toEqual([]);
    expect(g.torso.rotation.x).toBeGreaterThan(0.1); // tipped: the dodge window
    // The windup expires: the strike lands.
    for (let i = 0; i < 15; i++) system.fixedUpdate(DT, 0.5, 10, 0.5, (d) => damages.push(d));
    expect(damages).toEqual([3]);
    for (let i = 0; i < 60 * 3; i++) {
      system.fixedUpdate(DT, 0.5, 10, 0.5, (d) => damages.push(d));
    }
    // Windup + 1.2s cooldown cadence over ~3.5s: 2-3 strikes, never more.
    expect(damages.length).toBeGreaterThanOrEqual(2);
    expect(damages.length).toBeLessThanOrEqual(4);
    expect(damages.every((d) => d === 3)).toBe(true);
  });

  it('a strike whiffs when the player steps away during the tell', () => {
    const { system } = makeSystem(noDungeon);
    system.spawnAt(2.0, 10, 0.5, 'a', { x: 2, y: 10, z: 0.5 });
    const damages: number[] = [];
    // Start the windup in range...
    for (let i = 0; i < 6; i++) system.fixedUpdate(DT, 0.5, 10, 0.5, (d) => damages.push(d));
    // ...then the player retreats far before it lands: no damage.
    for (let i = 0; i < 40; i++) system.fixedUpdate(DT, 12.5, 10, 0.5, (d) => damages.push(d));
    expect(damages).toEqual([]);
  });

  it('leash beyond 16 turns it home, ignoring an adjacent player', () => {
    const { system } = makeSystem(noDungeon);
    const home = { x: 8, y: 10, z: 8 };
    const g = system.spawnAt(30.5, 10, 8.5, '0,0', home); // ~22.5 from home
    const startHomeDist = Math.hypot(g.body.x - home.x, g.body.z - home.z);
    let hits = 0;
    for (let i = 0; i < 60 * 2; i++) system.fixedUpdate(DT, 32.5, 10, 8.5, () => hits++);
    const endHomeDist = Math.hypot(g.body.x - home.x, g.body.z - home.z);
    expect(endHomeDist).toBeLessThan(startHomeDist - 2); // trudging back
    expect(hits).toBe(0); // the player right beside it is ignored
  });

  it('is ray-picked from the eye, but never mid-death-pop', () => {
    const { system } = makeSystem(noDungeon);
    const g = system.spawnAt(4.5, 10, 0.5, 'a', { x: 4.5, y: 10, z: 0.5 });
    const hit = system.raycastNearest(0.5, 11, 0.5, 1, 0, 0, 8);
    expect(hit?.guardian).toBe(g);
    expect(hit?.distance).toBeCloseTo(4.5 - 0.42 - 0.5, 3); // to the AABB face
    expect(system.raycastNearest(0.5, 11, 0.5, 1, 0, 0, 1)).toBeNull(); // too short
    kill(system, g);
    expect(system.raycastNearest(0.5, 11, 0.5, 1, 0, 0, 8)).toBeNull(); // popping
  });
});

describe('guardian hurt chain', () => {
  it('non-lethal hits flash and take knockback at half strength', () => {
    const { system } = makeSystem(noDungeon);
    const g = system.spawnAt(4.5, 10, 0.5, 'a', { x: 4.5, y: 10, z: 0.5 });
    expect(system.hurt(g, 1, 0)).toBeNull();
    expect(g.hp).toBe(GUARDIAN_HP - 2);
    expect(g.flash).toBeGreaterThan(0);
    expect(g.kbX).toBeCloseTo(3); // 1 × 6, resisted ×0.5
    expect(g.kbZ).toBeCloseTo(0);
  });

  it('the lethal hit rolls gem (rng < 0.6) or gold ingot, never twice', () => {
    const gemSys = makeSystem(noDungeon, () => 0.2).system;
    const gemBrute = gemSys.spawnAt(4.5, 10, 0.5, 'a', { x: 4.5, y: 10, z: 0.5 });
    expect(kill(gemSys, gemBrute)).toEqual({ id: Item.gem, count: 1 });
    expect(gemSys.hurt(gemBrute)).toBeNull(); // already slain — no double loot

    const goldSys = makeSystem(noDungeon, () => 0.95).system;
    const goldBrute = goldSys.spawnAt(4.5, 10, 0.5, 'a', { x: 4.5, y: 10, z: 0.5 });
    expect(kill(goldSys, goldBrute)).toEqual({ id: Item.goldIngot, count: 1 });
  });

  it('death-pops (shrinking) and leaves the scene after ~0.2s', () => {
    const { system, scene } = makeSystem(noDungeon);
    const g = system.spawnAt(4.5, 10, 0.5, 'a', { x: 4.5, y: 10, z: 0.5 });
    const before = scene.children.length;
    expect(kill(system, g)).not.toBeNull();
    expect(scene.children.length).toBe(before); // the body lingers, shrinking
    system.fixedUpdate(DT, 0.5, 10, 0.5, noDamage);
    expect(g.group.scale.x).toBeLessThan(1);
    system.fixedUpdate(0.25, 0.5, 10, 0.5, noDamage); // pop elapses -> removal
    expect(system.count).toBe(0);
    expect(scene.children.length).toBe(before - 1);
  });

  it('a death frees the slot: the next scan respawns the pair', () => {
    const { system } = makeSystem();
    system.fixedUpdate(DT, 8.5, 10, 8.5, noDamage);
    expect(system.count).toBe(2);
    const g = system.guardians[0];
    expect(g).toBeDefined();
    if (!g) return;
    kill(system, g);
    for (let i = 0; i < 30; i++) system.fixedUpdate(DT, 8.5, 10, 8.5, noDamage);
    expect(system.count).toBe(1); // popped away, slot open, scan not due yet
    for (let i = 0; i < 60 * 2 + 10; i++) system.fixedUpdate(DT, 8.5, 10, 8.5, noDamage);
    expect(system.count).toBe(2); // the 2s scan refilled the pair
    expect(system.guardians.every((v) => v.key === '0,0')).toBe(true);
  });
});
