/**
 * Village wardens: deterministic village-tagged spawning near the centre,
 * the day/night leash, startle fleeing (no hp, no drops), per-village
 * population caps, ray picking and the hooded rig.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { hash2, mulberry32 } from '../src/world/noise';
import { villageCenterFor } from '../src/world/worldgen';
import { CHUNK_SIZE } from '../src/world/chunk';
import { Block } from '../src/world/blocks';
import type { WorldView } from '../src/player/controller';
import {
  LEASH_DIST,
  NIGHT_LEASH_DIST,
  packVillageKey,
  populationFor,
  TUNIC_PALETTE,
  VillagerSystem,
  VILLAGER_HALF_WIDTH,
  VILLAGER_HEIGHT,
} from '../src/entities/villagers';

const DT = 1 / 60;
const SEED = 1234;

/** Flat solid slab: topmost solid block at y=59, wardens stand at y=60. */
const flatWorld: WorldView = {
  isSolid: (_x, y, _z) => y < 60,
  getBlock: (_x, y, _z) => (y < 60 ? Block.stone : Block.air),
};

function makeSystem(seedInt = SEED, rng = 42): { system: VillagerSystem; scene: THREE.Scene } {
  const scene = new THREE.Scene();
  const system = new VillagerSystem(scene, seedInt, mulberry32(rng));
  system.setWorld(flatWorld);
  return { system, scene };
}

/** First region near the origin that hosts a village, with its centre block. */
function findVillage(seedInt: number): { rx: number; rz: number; x: number; z: number } {
  for (let rx = -4; rx <= 4; rx++) {
    for (let rz = -4; rz <= 4; rz++) {
      const c = villageCenterFor(seedInt, rx, rz);
      if (c !== null) {
        return {
          rx,
          rz,
          x: c.cx * CHUNK_SIZE + (CHUNK_SIZE >> 1),
          z: c.cz * CHUNK_SIZE + (CHUNK_SIZE >> 1),
        };
      }
    }
  }
  throw new Error(`seed ${seedInt} rolled no village within 4 regions of the origin`);
}

describe('village-tagged spawning', () => {
  it('pins the spec: population is 3 + (hash >>> 6) % 3, always 3-5', () => {
    for (let rx = -3; rx <= 3; rx++) {
      for (let rz = -3; rz <= 3; rz++) {
        const pop = populationFor(SEED, rx, rz);
        expect(pop).toBe(3 + ((hash2(SEED, rx, rz) >>> 6) % 3));
        expect(pop).toBeGreaterThanOrEqual(3);
        expect(pop).toBeLessThanOrEqual(5);
      }
    }
  });

  it('fills a nearby village with wardens tagged to it, near its centre', () => {
    const v = findVillage(SEED);
    const { system } = makeSystem();
    for (let i = 0; i < 60 * 40; i++) system.fixedUpdate(DT, v.x, 61, v.z);
    const key = packVillageKey(v.rx, v.rz);
    const pop = populationFor(SEED, v.rx, v.rz);
    const mine = system.villagers.filter((w) => w.villageKey === key);
    expect(mine.length).toBe(pop);
    // Indices are the stable barter-book slots 0..pop-1, each held once.
    const indices = new Set(mine.map((w) => w.index));
    expect(indices.size).toBe(pop);
    for (const w of mine) {
      expect(w.index).toBeGreaterThanOrEqual(0);
      expect(w.index).toBeLessThan(pop);
      expect(w.homeX).toBeCloseTo(v.x + 0.5, 5);
      expect(w.homeZ).toBeCloseTo(v.z + 0.5, 5);
      // Spawned within ±6 of the centre and leashed to 24 ever since.
      const dist = Math.hypot(w.body.x - v.x, w.body.z - v.z);
      expect(dist).toBeLessThanOrEqual(LEASH_DIST + 2);
      expect(w.body.y).toBe(60); // standing flush on the slab surface
    }
  });

  it('caps every village at its own rolled population', () => {
    const v = findVillage(SEED);
    const { system } = makeSystem(SEED, 9);
    const key = packVillageKey(v.rx, v.rz);
    const pop = populationFor(SEED, v.rx, v.rz);
    let peak = 0;
    for (let i = 0; i < 60 * 60; i++) {
      system.fixedUpdate(DT, v.x, 61, v.z);
      let mine = 0;
      for (const w of system.villagers) if (w.villageKey === key) mine++;
      peak = Math.max(peak, mine);
    }
    expect(peak).toBe(pop); // fills the target and never breaches it
    // Any neighbouring villages that woke up respect their own targets too.
    const targets = new Map<number, number>();
    for (let rx = -6; rx <= 6; rx++) {
      for (let rz = -6; rz <= 6; rz++) {
        targets.set(packVillageKey(rx, rz), populationFor(SEED, rx, rz));
      }
    }
    const byKey = new Map<number, number>();
    for (const w of system.villagers) byKey.set(w.villageKey, (byKey.get(w.villageKey) ?? 0) + 1);
    for (const [k, n] of byKey) {
      expect(targets.has(k)).toBe(true); // every warden belongs to a real village
      expect(n).toBeLessThanOrEqual(targets.get(k)!);
    }
  });

  it('falls and lands flush on the surface like any entity body', () => {
    const { system } = makeSystem();
    system.setSpawning(false);
    const w = system.spawnAt(0.5, 70, 0.5);
    for (let i = 0; i < 300; i++) system.fixedUpdate(DT, 0.5, 61, 0.5);
    expect(w.body.y).toBe(60);
    expect(w.body.onGround).toBe(true);
  });

  it('despawns wardens left far behind, and clear() empties the scene', () => {
    const { system, scene } = makeSystem();
    system.setSpawning(false);
    const w = system.spawnAt(0.5, 60, 0.5);
    const children = scene.children.length;
    system.fixedUpdate(DT, 90, 61, 0.5); // 89.5 away — inside the 110 bubble
    expect(system.villagers.includes(w)).toBe(true);
    system.fixedUpdate(DT, 500, 61, 500); // far beyond 110
    expect(system.villagers.includes(w)).toBe(false);
    expect(scene.children.length).toBe(children - 1);
    system.spawnAt(0.5, 60, 0.5);
    system.spawnAt(2.5, 60, 0.5);
    expect(system.count).toBe(2);
    system.clear();
    expect(system.count).toBe(0);
    expect(scene.children.length).toBe(children - 1);
  });
});

describe('leash & night behaviour', () => {
  it('steers home once beyond the 24-block day leash', () => {
    const { system } = makeSystem();
    system.setSpawning(false);
    // Home at (8.5, 8.5); dropped 32 blocks east of it — well past the leash.
    const w = system.spawnAt(40.5, 60, 8.5, packVillageKey(0, 0), 0, 8.5, 8.5);
    system.fixedUpdate(DT, 40, 61, 8);
    expect(w.moving).toBe(true);
    expect(w.body.vx).toBeLessThan(-1); // walking due -x, toward home
    expect(Math.abs(w.body.vz)).toBeLessThan(0.01);
    for (let i = 0; i < 60 * 20; i++) system.fixedUpdate(DT, 40, 61, 8);
    expect(Math.hypot(w.body.x - 8.5, w.body.z - 8.5)).toBeLessThan(LEASH_DIST + 1);
  });

  it('night slows the walk to 0.5 and tightens the leash to 10', () => {
    const { system } = makeSystem();
    system.setSpawning(false);
    // 20 east of home: inside the day leash, outside the night leash.
    const w = system.spawnAt(28.5, 60, 8.5, packVillageKey(0, 0), 0, 8.5, 8.5);
    w.timer = 99; // pin the wander AI: only the leash may move it
    w.moving = false;
    system.fixedUpdate(DT, 28, 61, 8);
    expect(Math.hypot(w.body.vx, w.body.vz)).toBe(0); // day: content to idle here
    system.setNight(true);
    expect(system.isNight).toBe(true);
    system.fixedUpdate(DT, 28, 61, 8);
    expect(w.moving).toBe(true);
    expect(w.body.vx).toBeLessThan(0); // heading home...
    expect(Math.hypot(w.body.vx, w.body.vz)).toBeCloseTo(0.5, 5); // ...at night pace
    for (let i = 0; i < 60 * 35; i++) system.fixedUpdate(DT, 28, 61, 8);
    expect(Math.hypot(w.body.x - 8.5, w.body.z - 8.5)).toBeLessThan(NIGHT_LEASH_DIST + 2);
  });

  it('startle knocks back and flees 2 s at a sprint — no hp, no drops', () => {
    const { system } = makeSystem();
    system.setSpawning(false);
    const w = system.spawnAt(8.5, 60, 8.5, packVillageKey(0, 0), 1, 8.5, 8.5);
    expect('hp' in w).toBe(false); // wardens are not prey
    system.startle(w, 1, 0); // struck from the west: bolt east
    expect(w.flee).toBeCloseTo(2, 5);
    expect(w.kbX).toBeGreaterThan(0);
    const x0 = w.body.x;
    system.fixedUpdate(DT, 8.5, 61, 8.5);
    expect(w.body.vx).toBeGreaterThan(2); // flee sprint + knockback, due east
    expect(w.mats.some((m) => m.emissive.r > 0)).toBe(true); // warm startle blink
    for (let i = 0; i < 60; i++) system.fixedUpdate(DT, 8.5, 61, 8.5);
    expect(w.body.x - x0).toBeGreaterThan(2); // actually covered ground away
    for (let i = 0; i < 90; i++) system.fixedUpdate(DT, 8.5, 61, 8.5);
    expect(w.flee).toBeLessThanOrEqual(0); // the sprint has expired
    expect(w.mats.every((m) => m.emissive.r === 0)).toBe(true); // blink faded
  });
});

describe('picking & rig', () => {
  it('exports the collision box the interaction layer expects', () => {
    expect(VILLAGER_HALF_WIDTH).toBe(0.3);
    expect(VILLAGER_HEIGHT).toBe(1.7);
  });

  it('raycastNearest picks the closest warden in reach', () => {
    const { system } = makeSystem();
    system.setSpawning(false);
    system.spawnAt(8.5, 60, 0.5, packVillageKey(0, 0), 0, 8.5, 0.5);
    const near = system.spawnAt(3.5, 60, 0.5, packVillageKey(0, 0), 1, 3.5, 0.5);
    const hit = system.raycastNearest(0.5, 60.8, 0.5, 1, 0, 0, 12);
    expect(hit).not.toBeNull();
    expect(hit!.villager).toBe(near);
    expect(hit!.distance).toBeCloseTo(3.5 - VILLAGER_HALF_WIDTH - 0.5, 5);
    expect(system.raycastNearest(0.5, 60.8, 0.5, 1, 0, 0, 1)).toBeNull(); // out of reach
  });

  it('rigs are hooded, palette-dyed, dark-eyed, and all named "entity"', () => {
    const { system } = makeSystem();
    system.setSpawning(false);
    // Palette literals, run through Color so both sides share the conversion.
    const palette = new Set(TUNIC_PALETTE.map((c) => new THREE.Color(c).getHexString()));
    const colors = new Set<string>();
    let aproned = 0;
    for (let i = 0; i < 12; i++) {
      const w = system.spawnAt(i + 0.5, 60, 0.5, packVillageKey(0, 0), i, i + 0.5, 0.5);
      w.group.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        expect(obj.name).toBe('entity');
        if (obj.material instanceof THREE.MeshBasicMaterial && !obj.material.transparent) {
          // The only opaque unlit parts are the two-layer eyes: warm white
          // sclera + dark pupil. (The transparent blob shadow is exempt.)
          const hex = parseInt(obj.material.color.getHexString(), 16);
          expect(hex === 0xf2efe6 || hex < 0x404040).toBe(true);
        }
      });
      expect(w.head.children.length).toBeGreaterThanOrEqual(4); // hood, brim, two eyes
      expect(w.legs.length).toBe(2);
      expect(w.arms.length).toBe(2);
      const tunic = (w.torso.material as THREE.MeshLambertMaterial).color.getHexString();
      expect(palette.has(tunic)).toBe(true);
      colors.add(tunic);
      if (w.torso.children.length > 1) aproned++; // belt always, apron on some
    }
    expect(colors.size).toBeGreaterThanOrEqual(2); // the warm palette actually varies
    expect(aproned).toBeGreaterThan(0); // some wear aprons...
    expect(aproned).toBeLessThan(12); // ...but not all
    // Identical (villageKey, index) → identical look, every session.
    const { system: again } = makeSystem();
    const twin = again.spawnAt(0.5, 60, 0.5, packVillageKey(0, 0), 3, 0.5, 0.5);
    const original = system.villagers[3]!;
    expect((twin.torso.material as THREE.MeshLambertMaterial).color.getHexString()).toBe(
      (original.torso.material as THREE.MeshLambertMaterial).color.getHexString(),
    );
  });

  it('swings limbs while walking and sways arms + bobs the head while idle', () => {
    const { system } = makeSystem();
    system.setSpawning(false);
    const idler = system.spawnAt(0.5, 60, 0.5, packVillageKey(0, 0), 0, 0.5, 0.5);
    idler.timer = 99; // pin the AI so it stays put
    idler.moving = false;
    for (let i = 0; i < 30; i++) system.fixedUpdate(DT, 0.5, 61, 0.5);
    expect(Math.abs(idler.head.rotation.x)).toBeGreaterThan(0.005); // head bobs...
    expect(Math.abs(idler.head.rotation.x)).toBeLessThanOrEqual(0.06); // ...gently
    expect(Math.abs(idler.arms[0]!.rotation.z)).toBeGreaterThan(0.01); // arms rest off the hips
    expect(Math.abs(idler.legs[0]!.rotation.x)).toBeLessThan(0.001); // legs settled

    const walker = system.spawnAt(4.5, 60, 4.5, packVillageKey(0, 0), 1, 4.5, 4.5);
    walker.timer = 99;
    walker.moving = true;
    let swing = 0;
    for (let i = 0; i < 60; i++) {
      system.fixedUpdate(DT, walker.body.x, 61, walker.body.z);
      swing = Math.max(swing, Math.abs(walker.legs[0]!.rotation.x));
    }
    expect(swing).toBeGreaterThan(0.1); // legs actually stride
    // Arms counter-swing their side's leg at 0.8 amplitude, every frame.
    expect(walker.arms[0]!.rotation.x).toBeCloseTo(-walker.legs[0]!.rotation.x * 0.8, 5);
  });
});

describe('underfolk traders (deephold halls)', () => {
  it('fills a nearby deephold hall with three traders on its floor', () => {
    const { system } = makeSystem();
    // A hall floor at y=84 with air above (the flatWorld stub is solid
    // below y=60, so give the sweep its own little world).
    system.setWorld({
      isSolid: (_x, y) => y === 83,
      getBlock: (_x, y) => (y === 83 ? Block.mossstone : Block.air),
    });
    system.setDeepholdFn((cx, cz) => (cx === 0 && cz === 0 ? { x: 8, y: 84, z: 8 } : null));
    for (let i = 0; i < 8; i++) system.fixedUpdate(2.1, 8, 84, 8);
    expect(system.villagers.length).toBe(3); // DEEP_POPULATION, no more
    for (const v of system.villagers) {
      // Homed on the hall centre (they may wander within the leash).
      expect(Math.hypot(v.body.x - 8.5, v.body.z - 8.5)).toBeLessThanOrEqual(LEASH_DIST + 1);
      expect(v.homeX).toBeCloseTo(8.5, 5);
      expect(v.body.y).toBeCloseTo(84, 0);
    }
    // The two traders hold distinct indices under the same (salted) key.
    const keys = new Set(system.villagers.map((v) => v.villageKey));
    expect(keys.size).toBe(1);
    expect(new Set(system.villagers.map((v) => v.index)).size).toBe(3);
    expect(keys.has(packVillageKey(0, 0))).toBe(false); // never a surface key
  });
});
