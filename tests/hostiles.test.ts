/**
 * Hostile mobs: night-only spawning, player-seeking, melee damage, daylight
 * burn-off, and being fought back with the shared ray-pick/hurt path.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HostileSystem, NIGHT_BRIGHTNESS, STALKER_HP } from '../src/entities/hostiles';
import { mulberry32 } from '../src/world/noise';
import { Block } from '../src/world/blocks';
import { PlayerController, type WorldView } from '../src/player/controller';

const DT = 1 / 60;
const NIGHT = NIGHT_BRIGHTNESS - 0.1;
const DAY = 0.9;
const noDamage = (): void => {};

/** Solid ground below y=10 (stone), open air above. */
const flatWorld: WorldView = {
  isSolid: (_x, y, _z) => y <= 9,
  getBlock: (_x, y, _z) => (y <= 9 ? Block.stone : Block.air),
};

function makeSystem(seed = 5): { system: HostileSystem; scene: THREE.Scene } {
  const scene = new THREE.Scene();
  const system = new HostileSystem(scene, mulberry32(seed));
  system.setWorld(flatWorld);
  return { system, scene };
}

describe('hostile spawning', () => {
  it('spawns at night but never in daylight', () => {
    const day = makeSystem();
    for (let i = 0; i < 60 * 30; i++) day.system.fixedUpdate(DT, 0.5, 11, 0.5, DAY, noDamage);
    expect(day.system.count).toBe(0);

    const night = makeSystem();
    for (let i = 0; i < 60 * 30; i++) night.system.fixedUpdate(DT, 0.5, 11, 0.5, NIGHT, noDamage);
    expect(night.system.count).toBeGreaterThan(0);
    expect(night.system.count).toBeLessThanOrEqual(18); // raised cap for chaos spawning
  });
});

describe('hostile behaviour', () => {
  it('chases the player, closing the distance', () => {
    const { system } = makeSystem();
    const s = system.spawnAt(20.5, 11, 0.5);
    const startDist = Math.abs(s.body.x - 0.5);
    for (let i = 0; i < 60 * 3; i++) system.fixedUpdate(DT, 0.5, 11, 0.5, NIGHT, noDamage);
    expect(Math.abs(s.body.x - 0.5)).toBeLessThan(startDist);
  });

  it('strikes the player on contact, respecting the cooldown', () => {
    const { system } = makeSystem();
    system.spawnAt(1.4, 11, 0.5); // within attack range of the player at 0.5
    let hits = 0;
    for (let i = 0; i < 60 * 3; i++) {
      system.fixedUpdate(DT, 0.5, 11, 0.5, NIGHT, () => hits++);
    }
    expect(hits).toBeGreaterThan(0);
    expect(hits).toBeLessThanOrEqual(4); // ~1s cooldown over 3s
  });

  it('burns away after sustained daylight', () => {
    const { system } = makeSystem();
    system.spawnAt(3.5, 11, 0.5);
    expect(system.count).toBe(1);
    for (let i = 0; i < 60 * 6; i++) system.fixedUpdate(DT, 0.5, 11, 0.5, DAY, noDamage);
    expect(system.count).toBe(0);
  });

  it('is killed in STALKER_HP/2 punches, death-pops, then leaves the scene', () => {
    const { system, scene } = makeSystem();
    const s = system.spawnAt(3.5, 11, 0.5);
    const before = scene.children.length;
    let dead = false;
    for (let i = 0; i < STALKER_HP / 2; i++) dead = system.hurt(s);
    expect(dead).toBe(true); // the kill is reported on the lethal hit itself
    // Death pop: the body lingers ~0.18s shrinking — untargetable, unhittable.
    expect(scene.children.length).toBe(before);
    expect(system.hurt(s)).toBe(false);
    expect(system.raycastNearest(0.5, 12.6, 0.5, 1, 0, 0, 8)).toBeNull();
    system.fixedUpdate(0.2, 0.5, 11, 0.5, DAY, noDamage); // pop elapses -> removal
    expect(system.count).toBe(0);
    expect(scene.children.length).toBe(before - 1);
  });

  it('telegraphs melee strikes with a decaying torso lunge', () => {
    const { system } = makeSystem();
    const s = system.spawnAt(1.4, 11, 0.5, false); // in range: first tick strikes
    system.fixedUpdate(DT, 0.5, 11, 0.5, NIGHT, noDamage);
    expect(s.torso.rotation.x).toBeGreaterThan(0.2); // tipped ~0.25 forward
    for (let i = 0; i < 40; i++) system.fixedUpdate(DT, 0.5, 11, 0.5, NIGHT, noDamage);
    expect(s.torso.rotation.x).toBe(0); // decayed upright before the next swing
  });

  it('is ray-picked from the eye', () => {
    const { system } = makeSystem();
    const s = system.spawnAt(4.5, 11, 0.5);
    const hit = system.raycastNearest(0.5, 12.6, 0.5, 1, 0, 0, 8);
    expect(hit?.stalker).toBe(s);
    expect(system.raycastNearest(0.5, 12.6, 0.5, 1, 0, 0, 1)).toBeNull();
  });
});

describe('player damage', () => {
  it('hurts the player in survival but not in creative', () => {
    const survivor = new PlayerController();
    survivor.setMode('survival');
    survivor.hurt(5);
    expect(survivor.hp).toBe(15);

    const builder = new PlayerController();
    builder.setMode('creative');
    builder.hurt(5);
    expect(builder.hp).toBe(20); // immune in creative
  });
});

describe('ranged spitters', () => {
  it('fire projectiles at the player and hold their distance', () => {
    const { system } = makeSystem();
    // A ranged spitter 12 blocks from the player.
    const s = system.spawnAt(12.5, 11, 0.5, true);
    expect(s.ranged).toBe(true);
    let hits = 0;
    for (let i = 0; i < 60 * 3; i++) {
      system.fixedUpdate(DT, 0.5, 11, 0.5, NIGHT, () => hits++);
    }
    // It launched projectiles (some may still be flying) and hit the player.
    expect(hits).toBeGreaterThan(0);
    // It kept roughly its preferred distance, not melee range.
    expect(Math.abs(s.body.x - 0.5)).toBeGreaterThan(3);
  });

  it('projectiles stop at terrain', () => {
    // Wall the player off: solid everywhere x>=6, so shots never connect.
    const walled: WorldView = {
      isSolid: (x, y, _z) => y <= 9 || x >= 6,
      getBlock: (x, y, _z) => (y <= 9 || x >= 6 ? Block.stone : Block.air),
    };
    const scene = new THREE.Scene();
    const system = new HostileSystem(scene, mulberry32(2));
    system.setWorld(walled);
    system.spawnAt(12.5, 11, 0.5, true);
    let hits = 0;
    for (let i = 0; i < 60 * 3; i++) system.fixedUpdate(DT, 0.5, 11, 0.5, NIGHT, () => hits++);
    expect(hits).toBe(0); // every shot dies on the wall
  });

  it('clears projectiles on world reset', () => {
    const { system } = makeSystem();
    system.spawnAt(12.5, 11, 0.5, true);
    for (let i = 0; i < 60; i++) system.fixedUpdate(DT, 0.5, 11, 0.5, NIGHT, () => {});
    system.setWorld(null);
    expect(system.projectileCount).toBe(0);
    expect(system.count).toBe(0);
  });
});
