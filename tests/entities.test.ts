/**
 * Wildlife: ray-vs-AABB picking, animal physics/AI smoke, hunting drops, and
 * eating to heal.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { rayAABB } from '../src/world/raycast';
import { AnimalSystem, ANIMAL_HP, MAX_ANIMALS } from '../src/entities/animals';
import { mulberry32 } from '../src/world/noise';
import { Item } from '../src/world/items';
import { Block } from '../src/world/blocks';
import { createBody, MAX_HP, moveBody, type MoveResult } from '../src/player/physics';
import { PlayerController, type WorldView } from '../src/player/controller';

const DT = 1 / 60;

describe('rayAABB', () => {
  const box = [2, 0, -1, 3, 1, 1] as const; // x[2,3] y[0,1] z[-1,1]

  it('returns the entry distance for a straight hit', () => {
    expect(rayAABB(0, 0.5, 0, 1, 0, 0, ...box)).toBeCloseTo(2);
    expect(rayAABB(5, 0.5, 0, -1, 0, 0, ...box)).toBeCloseTo(2);
  });

  it('misses to the side and behind', () => {
    expect(rayAABB(0, 5, 0, 1, 0, 0, ...box)).toBeNull(); // above the slab
    expect(rayAABB(0, 0.5, 0, -1, 0, 0, ...box)).toBeNull(); // box behind ray
  });

  it('returns 0 when the origin is inside', () => {
    expect(rayAABB(2.5, 0.5, 0, 1, 0, 0, ...box)).toBe(0);
  });

  it('handles diagonal rays and zero components', () => {
    const inv = Math.SQRT1_2;
    const t = rayAABB(0, 0.5, -3, 0, 0, 1, ...box);
    expect(t).toBeNull(); // ray along z at x=0 never enters x[2,3]
    expect(rayAABB(2.5, 0.5, -3, 0, 0, 1, ...box)).toBeCloseTo(2);
    // Diagonal from (1,.5,-2): x and z slabs overlap for t·√½ in [1,2].
    expect(rayAABB(1, 0.5, -2, inv, 0, inv, ...box)).toBeCloseTo(Math.SQRT2, 5);
    // Same diagonal from the origin exits the z slab before reaching x[2,3].
    expect(rayAABB(0, 0.5, 0, inv, 0, inv, ...box)).toBeNull();
  });
});

/** Flat world: solid floor below y=10, grass surface at y=9. */
const flatWorld: WorldView = {
  isSolid: (_x, y, _z) => y <= 9,
  getBlock: (_x, y, _z) => (y === 9 ? Block.grass : y < 9 ? Block.stone : Block.air),
};

function makeSystem(seed = 42): { system: AnimalSystem; scene: THREE.Scene } {
  const scene = new THREE.Scene();
  const system = new AnimalSystem(scene, mulberry32(seed));
  system.setWorld(flatWorld);
  return { system, scene };
}

describe('animals', () => {
  it('fall, land exactly on the ground and wander on it', () => {
    const { system } = makeSystem();
    const animal = system.spawnAt(0.5, 20, 0.5);
    for (let i = 0; i < 600; i++) system.fixedUpdate(DT, 0.5, 10, 0.5);
    expect(animal.body.y).toBe(10);
    expect(animal.body.onGround).toBe(true);
  });

  it('spawns wildlife on grass near the player over time', () => {
    const { system } = makeSystem(7);
    for (let i = 0; i < 60 * 30; i++) system.fixedUpdate(DT, 0.5, 10, 0.5); // 30s
    expect(system.count).toBeGreaterThan(0);
    expect(system.count).toBeLessThanOrEqual(MAX_ANIMALS);
  });

  it('despawns animals that end up far from the player', () => {
    const { system } = makeSystem();
    const far = system.spawnAt(0.5, 10, 0.5);
    system.fixedUpdate(DT, 500, 10, 500); // player teleports far away
    // (The same tick may legitimately spawn fresh wildlife near the player.)
    expect(system.animals.includes(far)).toBe(false);
  });

  it('is hunted in ANIMAL_HP punches, drops meat, and death-pops away', () => {
    const { system, scene } = makeSystem();
    system.setSpawning(false); // the pop tick below must not spawn fresh wildlife
    const animal = system.spawnAt(0.5, 10, 0.5);
    const childrenWithAnimal = scene.children.length;
    let drops: { id: number; count: number } | null = null;
    for (let i = 0; i < ANIMAL_HP; i++) drops = system.hurt(animal);
    // Drops are yielded immediately on the lethal hit.
    expect(drops).not.toBeNull();
    expect(drops!.id).toBe(Item.meat);
    expect(drops!.count).toBeGreaterThanOrEqual(1);
    expect(drops!.count).toBeLessThanOrEqual(2);
    // Death pop: the carcass lingers ~0.18s, shrinking, and can't be re-hit.
    expect(scene.children.length).toBe(childrenWithAnimal);
    expect(system.hurt(animal)).toBeNull(); // no double drops mid-pop
    const scaleBefore = animal.group.scale.x;
    system.fixedUpdate(DT, 0.5, 10, 0.5);
    expect(animal.group.scale.x).toBeLessThan(scaleBefore);
    system.fixedUpdate(0.2, 0.5, 10, 0.5); // pop elapses -> removal
    expect(system.count).toBe(0);
    expect(scene.children.length).toBe(childrenWithAnimal - 1);
  });

  it('raycastNearest picks the closest animal in reach', () => {
    const { system } = makeSystem();
    system.spawnAt(8.5, 10, 0.5);
    const near = system.spawnAt(3.5, 10, 0.5);
    const hit = system.raycastNearest(0.5, 10.3, 0.5, 1, 0, 0, 12);
    expect(hit).not.toBeNull();
    expect(hit!.animal).toBe(near);
    expect(hit!.distance).toBeCloseTo(3.5 - 0.35 - 0.5, 5);
    expect(system.raycastNearest(0.5, 10.3, 0.5, 1, 0, 0, 1)).toBeNull(); // out of reach
  });
});

describe('eating heals', () => {
  it('controller.heal clamps at MAX_HP', () => {
    const c = new PlayerController();
    c.hp = 10;
    c.heal(4);
    expect(c.hp).toBe(14);
    c.heal(99);
    expect(c.hp).toBe(MAX_HP);
  });
});

describe('entity-sized AABB physics', () => {
  it('small bodies use their own dimensions', () => {
    // Ceiling at y>=11: a 0.7-tall critter walks under it from y=10; the
    // 1.8-tall default body cannot even fit.
    const solid = (_x: number, y: number, _z: number): boolean => y <= 9 || y >= 11;
    const result: MoveResult = { hitX: false, hitY: false, hitZ: false };
    const critter = createBody(0.5, 10, 0.5);
    moveBody(solid, critter, 2, 0, 0, result, 0.35, 0.7);
    expect(result.hitX).toBe(false);
    expect(critter.x).toBeCloseTo(2.5);
    // And it still lands exactly on floors (open sky this time — starting
    // inside the ceiling band would be a self-intersecting spawn).
    const floorOnly = (_x: number, y: number, _z: number): boolean => y <= 9;
    const faller = createBody(0.5, 15, 0.5);
    for (let i = 0; i < 300 && !faller.onGround; i++) {
      faller.vy -= 32 * DT;
      moveBody(floorOnly, faller, 0, faller.vy * DT, 0, result, 0.35, 0.7);
    }
    expect(faller.y).toBe(10);
  });
});

describe('animal species & flocking', () => {
  it('assigns both species deterministically and renders distinct meshes', () => {
    const { system } = makeSystem(3);
    const a = system.spawnAt(0.5, 11, 0.5, 0);
    const b = system.spawnAt(2.5, 11, 0.5, 1);
    expect(a.species).toBe(0);
    expect(b.species).toBe(1);
    // Default (no species arg) still picks one of the two.
    const c = system.spawnAt(4.5, 11, 0.5);
    expect([0, 1]).toContain(c.species);
  });

  it('herds of one species drift together over time', () => {
    const { system } = makeSystem(11);
    // Scatter a same-species herd across a flat area.
    const herd = [
      system.spawnAt(0.5, 11, 0.5, 0),
      system.spawnAt(6.5, 11, 0.5, 0),
      system.spawnAt(0.5, 11, 6.5, 0),
      system.spawnAt(6.5, 11, 6.5, 0),
    ];
    const spread = (): number => {
      const cx = herd.reduce((s, a) => s + a.body.x, 0) / herd.length;
      const cz = herd.reduce((s, a) => s + a.body.z, 0) / herd.length;
      return herd.reduce((s, a) => s + Math.hypot(a.body.x - cx, a.body.z - cz), 0);
    };
    const before = spread();
    system.setSpawning(false); // isolate the tagged herd from ambient spawns
    // Keep the player at the herd centre so nothing despawns; cohesion pulls in.
    for (let i = 0; i < 60 * 25; i++) system.fixedUpdate(DT, 3.5, 11, 3.5);
    expect(herd.every((a) => system.animals.includes(a))).toBe(true);
    expect(system.count).toBe(4); // only the herd remains
    expect(spread()).toBeLessThan(before);
  });
});

describe('biome-aware spawning', () => {
  // A grassy/snowy flat world whose biome is whatever the test sets.
  function biomeWorld(surface: number): WorldView {
    return {
      isSolid: (_x, y, _z) => y <= 9,
      getBlock: (_x, y, _z) => (y === 9 ? surface : y < 9 ? Block.stone : Block.air),
    };
  }

  it('spawns the right species per biome (woollies in snow, striders in desert)', () => {
    // Snowy: every spawn is a woolly (species 1).
    const snowyScene = new THREE.Scene();
    const snowy = new AnimalSystem(snowyScene, mulberry32(4));
    snowy.setWorld(biomeWorld(Block.snow));
    snowy.setBiomeFn(() => 4); // Biome.snowy
    for (let i = 0; i < 60 * 40; i++) snowy.fixedUpdate(DT, 0.5, 10, 0.5);
    expect(snowy.count).toBeGreaterThan(0);
    expect(snowy.animals.every((a) => a.species === 1)).toBe(true);

    // Desert: now home to striders (species 2), not barren.
    const desertScene = new THREE.Scene();
    const desert = new AnimalSystem(desertScene, mulberry32(4));
    desert.setWorld(biomeWorld(Block.grass));
    desert.setBiomeFn(() => 2); // Biome.desert
    for (let i = 0; i < 60 * 40; i++) desert.fixedUpdate(DT, 0.5, 10, 0.5);
    expect(desert.count).toBeGreaterThan(0);
    expect(desert.animals.every((a) => a.species === 2)).toBe(true);
  });

  it('spawns a mix in temperate grassland', () => {
    const scene = new THREE.Scene();
    const sys = new AnimalSystem(scene, mulberry32(9));
    sys.setWorld(biomeWorld(Block.grass));
    sys.setBiomeFn(() => 0); // Biome.plains
    for (let i = 0; i < 60 * 60; i++) sys.fixedUpdate(DT, 0.5, 10, 0.5);
    expect(sys.count).toBeGreaterThan(0);
  });
});

describe('herd spawning & size variety', () => {
  /** Deterministic rng: plays `tape` in order, then repeats its last value. */
  function tapeRng(tape: readonly number[]): () => number {
    let i = 0;
    return () => tape[Math.min(i++, tape.length - 1)] ?? 0;
  }

  // angle 0 (east), dist 16 → lead column (16, 0); every later roll is 0.5:
  // temperate species → trundler, herd size 2 + ⌊0.5·3⌋ = 3, scatter +2/+2.
  const herdTape = [0, 0, 0.5] as const;

  it('one spawn tick drops a same-species herd of >= 2 close together', () => {
    const scene = new THREE.Scene();
    const system = new AnimalSystem(scene, tapeRng(herdTape));
    system.setWorld(flatWorld);
    system.fixedUpdate(DT, 0.5, 10, 0.5); // spawn timer starts elapsed → one trySpawn
    expect(system.count).toBeGreaterThanOrEqual(2);
    const lead = system.animals[0]!;
    for (const mate of system.animals) {
      expect(mate.species).toBe(lead.species);
      const gap = Math.hypot(mate.body.x - lead.body.x, mate.body.z - lead.body.z);
      expect(gap).toBeLessThanOrEqual(Math.hypot(3, 3)); // scatter is ±1..3 per axis
    }
  });

  it('skips herd-mates whose scatter column has no grass/snow surface', () => {
    // Grass only at the lead column (16, 0): every ±1..3 scatter offset lands
    // on stone, so the rolled herd of 3 truncates to the lead alone.
    const lonePatch: WorldView = {
      isSolid: (_x, y, _z) => y <= 9,
      getBlock: (x, y, z) =>
        y === 9 ? (x === 16 && z === 0 ? Block.grass : Block.stone) : y < 9 ? Block.stone : Block.air,
    };
    const scene = new THREE.Scene();
    const system = new AnimalSystem(scene, tapeRng(herdTape));
    system.setWorld(lonePatch);
    system.fixedUpdate(DT, 0.5, 10, 0.5);
    expect(system.count).toBe(1);
    const lead = system.animals[0]!;
    expect(lead.body.x).toBe(16.5); // dropped onto the scanned column's surface
    expect(lead.body.z).toBe(0.5);
    expect(lead.body.y).toBe(10);
  });

  it('herd spawning never exceeds MAX_ANIMALS', () => {
    const { system } = makeSystem(21);
    let peak = 0;
    for (let i = 0; i < 60 * 60; i++) {
      system.fixedUpdate(DT, 0.5, 10, 0.5);
      peak = Math.max(peak, system.count);
    }
    expect(peak).toBe(MAX_ANIMALS); // herds saturate the cap without breaching it
  });

  it('idles with a gentle head bob and rolls the torso only while walking', () => {
    const { system } = makeSystem();
    system.setSpawning(false);
    const idler = system.spawnAt(0.5, 10, 0.5);
    idler.moving = false;
    idler.timer = 99; // pin the AI decision so it stays idle
    for (let i = 0; i < 30; i++) system.fixedUpdate(DT, 0.5, 10, 0.5);
    expect(Math.abs(idler.head.rotation.x)).toBeGreaterThan(0.005); // head tilts...
    expect(Math.abs(idler.head.rotation.x)).toBeLessThanOrEqual(0.06); // ...gently
    expect(Math.abs(idler.torso.rotation.z)).toBeLessThan(0.001); // no roll at rest

    const walker = system.spawnAt(0.5, 10, 0.5);
    walker.moving = true;
    walker.timer = 99;
    let roll = 0;
    for (let i = 0; i < 30; i++) {
      system.fixedUpdate(DT, walker.body.x, 10, walker.body.z);
      roll = Math.max(roll, Math.abs(walker.torso.rotation.z));
    }
    expect(roll).toBeGreaterThan(0.01); // gait-synced body roll...
    expect(roll).toBeLessThanOrEqual(0.03 + 1e-9); // ...stays slight
  });

  it('names every body-part mesh "entity" across all species rigs', () => {
    const { system } = makeSystem();
    for (const species of [0, 1, 2, 3] as const) {
      const animal = system.spawnAt(0.5, 10, 0.5, species);
      animal.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) expect(obj.name).toBe('entity');
      });
    }
    // Detail pass sanity: the strider's neck raises its head above a trundler's.
    const [trundler, , strider] = system.animals;
    expect(strider!.head.position.y).toBeGreaterThan(trundler!.head.position.y + 0.2);
  });

  it('rolls each animal a visual scale in [0.85, 1.15], uniform across axes', () => {
    const { system } = makeSystem(5);
    const sizes = new Set<number>();
    for (let i = 0; i < 12; i++) {
      const animal = system.spawnAt(i + 0.5, 10, 0.5);
      expect(animal.group.scale.x).toBeGreaterThanOrEqual(0.85);
      expect(animal.group.scale.x).toBeLessThanOrEqual(1.15);
      expect(animal.group.scale.y).toBe(animal.group.scale.x);
      expect(animal.group.scale.z).toBe(animal.group.scale.x);
      sizes.add(animal.group.scale.x);
    }
    expect(sizes.size).toBeGreaterThan(1); // per-individual, not one fixed size
  });
});
