/**
 * Fish: spawning into deep-enough water, water-bound wandering (never leaves
 * water, turns away at walls), draining/flopping, hunting drops, the
 * population cap and per-fish visual variety. Worlds are tiny fakes; rng is
 * either a seeded stream or a deterministic tape.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  FISH_HALF_WIDTH,
  FISH_HEIGHT,
  FISH_HP,
  FishKind,
  FishSystem,
  MAX_FISH,
  type Fish,
} from '../src/entities/fish';
import { mulberry32 } from '../src/world/noise';
import { Item } from '../src/world/items';
import { Block } from '../src/world/blocks';
import type { WorldView } from '../src/player/controller';

const DT = 1 / 60;

/** Deterministic rng: plays `tape` in order, then repeats its last value. */
function tapeRng(tape: readonly number[]): () => number {
  let i = 0;
  return () => tape[Math.min(i++, tape.length - 1)] ?? 0;
}

/** The voxel cell containing the fish's centre point. */
function centerCell(world: WorldView, fish: Fish): number {
  return world.getBlock(
    Math.floor(fish.body.x),
    Math.floor(fish.body.y + FISH_HEIGHT / 2),
    Math.floor(fish.body.z),
  );
}

/** Water box: water fills x,z ∈ [0,8), y ∈ [4,8); stone shell below/around. */
const inBox = (x: number, y: number, z: number): boolean =>
  x >= 0 && x < 8 && z >= 0 && z < 8 && y >= 4 && y < 8;
const waterBox: WorldView = {
  isSolid: (x, y, z) => !inBox(x, y, z) && y < 8,
  getBlock: (x, y, z) => (inBox(x, y, z) ? Block.water : y < 8 ? Block.stone : Block.air),
};

/** Endless ocean: stone floor at y<=0, water up to y=50, air above. */
const ocean: WorldView = {
  isSolid: (_x, y, _z) => y <= 0,
  getBlock: (_x, y, _z) => (y <= 0 ? Block.stone : y <= 50 ? Block.water : Block.air),
};

/** One water column at (10, 0), `depth` cells deep with surface at y=6. */
function pond(depth: number): WorldView {
  const isWater = (x: number, y: number, z: number): boolean =>
    x === 10 && z === 0 && y <= 6 && y > 6 - depth;
  return {
    isSolid: (x, y, z) => y <= 6 && !isWater(x, y, z),
    getBlock: (x, y, z) => (isWater(x, y, z) ? Block.water : y <= 6 ? Block.stone : Block.air),
  };
}

// trySpawn rng tape: angle 0 (east), dist 10 → column (10, 0) for a player at
// the origin; kind roll 0.4 → shadowscale; school roll 0 → a single fish.
const spawnTape = [0, 0, 0.4, 0] as const;

describe('fish spawning', () => {
  it('refuses columns whose water is only one cell deep', () => {
    const system = new FishSystem(new THREE.Scene(), tapeRng(spawnTape));
    system.setWorld(pond(1));
    system.fixedUpdate(DT, 0, 7, 0); // spawn timer starts elapsed → one try
    expect(system.count).toBe(0);
  });

  it('spawns fully submerged into a 2-deep water column', () => {
    const system = new FishSystem(new THREE.Scene(), tapeRng(spawnTape));
    const world = pond(2);
    system.setWorld(world);
    system.fixedUpdate(DT, 0, 7, 0);
    expect(system.count).toBe(1);
    const fish = system.fishes[0]!;
    expect(fish.kind).toBe(FishKind.shadowscale);
    // It already swam one tick, but it is still inside the scanned column.
    expect(Math.floor(fish.body.x)).toBe(10);
    expect(Math.floor(fish.body.z)).toBe(0);
    // The fish centre sits in the deeper cell (y = 5), clear of the surface.
    expect(Math.floor(fish.body.y + FISH_HEIGHT / 2)).toBe(5);
    expect(centerCell(world, fish)).toBe(Block.water);
  });

  it('never exceeds the population cap in open ocean', () => {
    const system = new FishSystem(new THREE.Scene(), mulberry32(21));
    system.setWorld(ocean);
    let peak = 0;
    for (let i = 0; i < 60 * 120; i++) {
      system.fixedUpdate(DT, 0, 50, 0);
      peak = Math.max(peak, system.count);
      expect(system.count).toBeLessThanOrEqual(MAX_FISH);
    }
    expect(peak).toBe(MAX_FISH); // schools saturate the cap without breaching it
  });

  it('despawns fish far from the player', () => {
    const system = new FishSystem(new THREE.Scene(), mulberry32(3));
    system.setWorld(ocean);
    const far = system.spawnAt(0.5, 40, 0.5);
    system.fixedUpdate(DT, 500, 40, 500); // player teleports far away
    expect(system.fishes.includes(far)).toBe(false);
  });
});

describe('water-bound movement', () => {
  it('keeps every fish cell within water over many steps in a water box', () => {
    const system = new FishSystem(new THREE.Scene(), mulberry32(13));
    system.setWorld(waterBox);
    const spawns: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < 6; i++) {
      const x = 1.5 + i;
      const z = 1.5 + (i % 3) * 2;
      system.spawnAt(x, 5.5, z);
      spawns.push({ x, z });
    }
    let dryTicks = 0;
    const moved = new Array<boolean>(6).fill(false);
    for (let step = 0; step < 60 * 30; step++) {
      system.fixedUpdate(DT, 4, 6, 4);
      for (let i = 0; i < system.fishes.length; i++) {
        const fish = system.fishes[i]!;
        if (centerCell(waterBox, fish) !== Block.water) dryTicks++;
        const origin = spawns[i]!;
        if (Math.hypot(fish.body.x - origin.x, fish.body.z - origin.z) > 1) moved[i] = true;
      }
    }
    expect(dryTicks).toBe(0); // 1800 steps × 6 fish, never out of water
    expect(system.count).toBe(6); // nothing flopped, drowned out or despawned
    expect(moved.every(Boolean)).toBe(true); // they glide, not hover
  });

  it('turns away at walls instead of leaving the water', () => {
    // Tape 0.5 everywhere → wall reflections carry zero jitter (exact π).
    const system = new FishSystem(new THREE.Scene(), tapeRng([0.5]));
    system.setSpawning(false);
    system.setWorld(waterBox);
    const fish = system.spawnAt(7.5, 5.35, 4.5);
    fish.yaw = -Math.PI / 2; // nose toward +x — straight at the wall at x=8
    fish.targetYaw = fish.yaw;
    fish.timer = 999; // no wander re-rolls during the test
    const before = fish.yaw;
    let turned = false;
    let maxX = fish.body.x;
    for (let i = 0; i < 60 * 5; i++) {
      system.fixedUpdate(DT, 4, 6, 4);
      if (Math.cos(fish.yaw - before) < -0.2) turned = true; // heading reversed
      maxX = Math.max(maxX, fish.body.x);
      expect(centerCell(waterBox, fish)).toBe(Block.water);
    }
    expect(turned).toBe(true);
    expect(maxX).toBeLessThan(8); // reflected before ever crossing the wall
  });

  it('flops under gravity when its water drains and dies after the grace period', () => {
    let drained = false;
    const world: WorldView = {
      isSolid: (x, y, z) => !inBox(x, y, z) && y < 8,
      getBlock: (x, y, z) =>
        inBox(x, y, z) ? (drained ? Block.air : Block.water) : y < 8 ? Block.stone : Block.air,
    };
    const system = new FishSystem(new THREE.Scene(), mulberry32(8));
    system.setSpawning(false);
    system.setWorld(world);
    const fish = system.spawnAt(4.5, 6.35, 4.5);
    for (let i = 0; i < 60; i++) system.fixedUpdate(DT, 4, 6, 4);
    expect(system.count).toBe(1); // happily swimming while the box holds water
    drained = true;
    for (let i = 0; i < 60; i++) system.fixedUpdate(DT, 4, 6, 4); // 1 s dry
    expect(system.count).toBe(1); // still flopping within the grace period
    expect(fish.body.y).toBeLessThan(5); // gravity dropped it to the basin floor
    expect(fish.body.y).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < 60 * 2.5; i++) system.fixedUpdate(DT, 4, 6, 4); // > 3 s dry
    expect(system.count).toBe(0);
  });
});

describe('hunting fish', () => {
  it('flashes red on the first hit, drops meat ×1 and vanishes on the second', () => {
    const scene = new THREE.Scene();
    const system = new FishSystem(scene, mulberry32(2));
    system.setSpawning(false);
    system.setWorld(waterBox);
    const fish = system.spawnAt(4.5, 5.35, 4.5);
    const withFish = scene.children.length;

    expect(system.hurt(fish, 1, 0)).toBeNull(); // first hit: no drops yet
    expect(fish.hp).toBe(FISH_HP - 1);
    expect(fish.flash).toBeCloseTo(0.22);
    expect(fish.kbX).toBeGreaterThan(0); // knockback along the attack direction
    system.fixedUpdate(DT, 4, 6, 4);
    expect(fish.mats[0]!.emissive.r).toBeGreaterThan(0); // red hurt flash is on
    for (let i = 0; i < 30; i++) system.fixedUpdate(DT, 4, 6, 4); // 0.5 s later
    expect(fish.mats[0]!.emissive.r).toBe(0); // flash has decayed

    const drops = system.hurt(fish); // second hit kills
    expect(drops).toEqual({ id: Item.meat, count: 1 });
    // Death pop: the fish lingers shrinking for a beat, then despawns —
    // the same farewell every other creature gets.
    expect(fish.dying).toBeGreaterThan(0);
    expect(system.hurt(fish)).toBeNull(); // no double drops while popping
    for (let i = 0; i < 20; i++) system.fixedUpdate(DT, 4, 6, 4);
    expect(system.count).toBe(0);
    expect(scene.children.length).toBe(withFish - 1);
  });

  it('raycastNearest picks the closest fish in reach', () => {
    const system = new FishSystem(new THREE.Scene(), mulberry32(4));
    system.setSpawning(false);
    system.setWorld(ocean);
    system.spawnAt(8.5, 40, 0.5);
    const near = system.spawnAt(3.5, 40, 0.5);
    const hit = system.raycastNearest(0.5, 40.15, 0.5, 1, 0, 0, 12);
    expect(hit).not.toBeNull();
    expect(hit!.fish).toBe(near);
    expect(hit!.distance).toBeCloseTo(3.5 - FISH_HALF_WIDTH - 0.5, 5);
    expect(system.raycastNearest(0.5, 40.15, 0.5, 1, 0, 0, 1)).toBeNull(); // out of reach
  });
});

describe('fish variety', () => {
  it('offers three kinds with distinct body colours and a wagging tail', () => {
    const system = new FishSystem(new THREE.Scene(), mulberry32(1));
    system.setSpawning(false);
    system.setWorld(waterBox);
    const colors = new Set<string>();
    for (const kind of [FishKind.dartfin, FishKind.shadowscale, FishKind.sunnygill]) {
      const fish = system.spawnAt(4.5, 5.35, 4.5, kind);
      expect(fish.kind).toBe(kind);
      colors.add(fish.mats[0]!.color.getHexString());
    }
    expect(colors.size).toBe(3);
    const fish = system.fishes[0]!;
    const tailAngles = new Set<number>();
    for (let i = 0; i < 30; i++) {
      system.fixedUpdate(DT, 4, 6, 4);
      tailAngles.add(fish.tail.rotation.y);
    }
    expect(tailAngles.size).toBeGreaterThan(1); // rotation.y oscillates
  });

  it('rolls each fish a visual scale in [0.8, 1.2], uniform across axes', () => {
    const system = new FishSystem(new THREE.Scene(), mulberry32(5));
    system.setWorld(ocean);
    const sizes = new Set<number>();
    for (let i = 0; i < 12; i++) {
      const fish = system.spawnAt(i + 0.5, 40, 0.5);
      expect(fish.group.scale.x).toBeGreaterThanOrEqual(0.8);
      expect(fish.group.scale.x).toBeLessThanOrEqual(1.2);
      expect(fish.group.scale.y).toBe(fish.group.scale.x);
      expect(fish.group.scale.z).toBe(fish.group.scale.x);
      sizes.add(fish.group.scale.x);
    }
    expect(sizes.size).toBeGreaterThan(1); // per-individual, not one fixed size
  });
});
