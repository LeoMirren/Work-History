/**
 * Passive animals ("trundlers"): blocky critters that wander the grass near
 * the player, hop over obstacles, float in water, and can be hunted for meat.
 * Physics reuses the AABB sweep with entity dimensions; rendering is a small
 * per-species rig of Lambert boxes (torso/head/legs plus character details
 * like tails, ears, fleece, necks and horns). Not persisted — they respawn
 * around the player like ambient wildlife, in small same-species herds with
 * per-individual visual size variety. Slain animals play a brief shrinking
 * "death pop" before leaving the scene.
 */
import * as THREE from 'three';
import { Block } from '../world/blocks';
import { Item } from '../world/items';
import { rayAABB } from '../world/raycast';
import {
  createBody,
  GRAVITY,
  moveBody,
  TERMINAL_VELOCITY,
  type Body,
  type MoveResult,
} from '../player/physics';
import type { WorldView } from '../player/controller';
import { Biome } from '../world/worldgen';

export type BiomeFn = (wx: number, wz: number) => number;

export const ANIMAL_HALF_WIDTH = 0.35;
export const ANIMAL_HEIGHT = 0.7;
export const ANIMAL_HP = 3;
/** Population cap for the ambient wildlife around the player. */
export const MAX_ANIMALS = 26;
const SPAWN_INTERVAL_S = 1.4;
const SPAWN_MIN_DIST = 16;
const SPAWN_MAX_DIST = 38;
const DESPAWN_DIST = 84;
const HERD_MIN = 2; // animals per successful spawn attempt (same species)
const HERD_MAX = 4;
const HERD_SCATTER = 3; // herd-mates land within ±1..3 blocks of the lead
const SIZE_MIN = 0.85; // per-individual visual scale range (collision unchanged)
const SIZE_MAX = 1.15;
const WALK_SPEED = 1.6;
const HOP_VELOCITY = 7.4;
const FLOCK_RADIUS = 9; // herd cohesion range (same species)
const FLOCK_CHANCE = 0.5; // per decision, steer toward the herd centroid
/** Death pop: a slain entity lingers this long, shrinking, before removal. */
const DYING_S = 0.18;
const DYING_SHRINK = 14; // per-second scale decay while dying
const DYING_MIN_SCALE = 0.05; // the pop never shrinks below this
const IDLE_BOB_RATE = Math.PI * 1.6; // idle phase advance (rad/s) — ~0.8 Hz head bob
const IDLE_BOB_TILT = 0.06; // idle head tilt/bob amplitude (radians)
const WALK_ROLL = 0.03; // torso roll amplitude while walking (radians)

/** Passive species — biome-flavoured visual variety; all drop meat. */
export const Species = { trundler: 0, woolly: 1, strider: 2, hopper: 3 } as const;
export type SpeciesId = (typeof Species)[keyof typeof Species];

interface SpeciesDef {
  readonly torso: readonly [number, number, number];
  readonly head: readonly [number, number, number];
  /** Head centre offset from the torso front. */
  readonly headZ: number;
  readonly legLen: number;
  readonly legW: number;
  readonly bodyColor: number;
  readonly headColor: number;
}

// Bodies stand on four hip-pivoted legs; torso/head heights derive from legLen.
const SPECIES: Record<SpeciesId, SpeciesDef> = {
  [Species.trundler]: {
    torso: [0.7, 0.4, 0.75],
    head: [0.34, 0.3, 0.3],
    headZ: -0.45,
    legLen: 0.28,
    legW: 0.16,
    bodyColor: 0xb08a5a,
    headColor: 0x7a5c39,
  },
  [Species.woolly]: {
    torso: [0.62, 0.5, 0.66],
    head: [0.3, 0.28, 0.28],
    headZ: -0.42,
    legLen: 0.26,
    legW: 0.15,
    bodyColor: 0xddd6c4,
    headColor: 0xc8bfa8,
  },
  // Desert strider: tall, lean, sandy.
  [Species.strider]: {
    torso: [0.48, 0.36, 0.56],
    head: [0.3, 0.26, 0.3],
    headZ: -0.36,
    legLen: 0.55,
    legW: 0.1,
    bodyColor: 0xd8b873,
    headColor: 0xb89a5c,
  },
  // Jungle hopper: small, squat, mossy green.
  [Species.hopper]: {
    torso: [0.5, 0.34, 0.52],
    head: [0.34, 0.3, 0.32],
    headZ: -0.34,
    legLen: 0.16,
    legW: 0.14,
    bodyColor: 0x6f9a4c,
    headColor: 0x567b3a,
  },
};

/** Which species belongs in a biome (pure; deserts/jungles now populated). */
export function speciesForBiome(biome: number, random: () => number): SpeciesId {
  if (biome === Biome.desert) return Species.strider;
  if (biome === Biome.jungle) return Species.hopper;
  if (biome === Biome.snowy) return Species.woolly;
  return random() < 0.7 ? Species.trundler : Species.woolly;
}

export interface Animal {
  readonly body: Body;
  readonly species: SpeciesId;
  yaw: number;
  hp: number;
  moving: boolean;
  timer: number;
  /** Walk-cycle phase driving the leg swing (creeps on while idle for the head bob). */
  phase: number;
  /** Death-pop seconds remaining; > 0 means slain: no AI, shrink, then despawn. */
  dying: number;
  /** Hurt-flash seconds remaining (materials glow red while > 0). */
  flash: number;
  /** Knockback impulse, decaying, added to walk velocity. */
  kbX: number;
  kbZ: number;
  readonly group: THREE.Group;
  readonly legs: readonly THREE.Mesh[];
  /** Torso mesh — rolls gently with the gait while walking. */
  readonly torso: THREE.Mesh;
  /** Head mesh — tilts/bobs while idle (eyes and face details ride along). */
  readonly head: THREE.Mesh;
  /** Per-animal material clones, so the hurt flash never tints the herd. */
  readonly mats: readonly THREE.MeshLambertMaterial[];
}

/** Shared per-eye material — eyes never flash, so one instance serves all. */
const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x1c1c22 });
/** Shared eye geometry — identical across every species. */
const eyeGeometry = new THREE.BoxGeometry(0.07, 0.07, 0.03);

function makeAnimalMesh(species: SpeciesId): {
  group: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Mesh;
  legs: THREE.Mesh[];
  mats: THREE.MeshLambertMaterial[];
} {
  const def = SPECIES[species];
  const mats: THREE.MeshLambertMaterial[] = [];
  /** Per-animal Lambert clone, registered so the hurt flash tints it. */
  const mat = (color: THREE.Color | number): THREE.MeshLambertMaterial => {
    const m = new THREE.MeshLambertMaterial({ color });
    mats.push(m);
    return m;
  };
  /** Accessory mesh named for the entity material sweep, attached to `parent`. */
  const detail = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D): THREE.Mesh => {
    const m = new THREE.Mesh(geometry, material);
    m.name = 'entity';
    parent.add(m);
    return m;
  };
  const head = mat(def.headColor);
  const leg = mat(new THREE.Color(def.bodyColor).multiplyScalar(0.72));
  // Woollies wear their fleece as a second, slightly lighter torso material.
  const body = mat(
    species === Species.woolly ? new THREE.Color(def.bodyColor).multiplyScalar(1.12) : def.bodyColor,
  );
  const group = new THREE.Group();
  group.name = 'entity';

  const [tw, th, td] = def.torso;
  const torsoY = def.legLen + th / 2;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(tw, th, td), body);
  torso.name = 'entity';
  torso.position.set(0, torsoY, 0);

  const [hw, hh, hd] = def.head;
  // Striders carry the head on a long neck; every other species keeps it snug.
  const headLift = species === Species.strider ? 0.34 : 0;
  const headY = torsoY + th / 2 - hh / 2 + 0.12 + headLift;
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(hw, hh, hd), head);
  headMesh.name = 'entity';
  headMesh.position.set(0, headY, def.headZ);
  group.add(torso, headMesh);

  // Two beady eyes — children of the head, so idle tilts carry the face.
  for (const ex of [-0.08, 0.08]) {
    detail(eyeGeometry, eyeMaterial, headMesh).position.set(ex, 0.03, -hd / 2 - 0.01);
  }

  if (species === Species.trundler) {
    // Stubby up-angled tail plus two small rounded ear nubs.
    const tail = detail(new THREE.BoxGeometry(0.14, 0.12, 0.22), body, group);
    tail.position.set(0, torsoY + th * 0.25, td / 2 + 0.06);
    tail.rotation.x = -0.55; // rear tip angled upward
    for (const ex of [-1, 1]) {
      const ear = detail(new THREE.SphereGeometry(0.055, 6, 5), head, headMesh);
      ear.position.set(ex * (hw / 2 - 0.05), hh / 2 + 0.02, 0.02);
    }
  } else if (species === Species.woolly) {
    // Fleece cap overhanging the head top, and a tiny tail puff.
    const cap = detail(new THREE.BoxGeometry(hw + 0.06, 0.12, hd + 0.06), body, headMesh);
    cap.position.set(0, hh / 2 + 0.03, 0.01);
    const puff = detail(new THREE.BoxGeometry(0.16, 0.16, 0.12), body, group);
    puff.position.set(0, torsoY + th * 0.2, td / 2 + 0.04);
  } else if (species === Species.strider) {
    // Long neck up to the raised head, crowned with back-swept horn nubs.
    const neck = detail(new THREE.BoxGeometry(0.14, headLift + 0.24, 0.16), body, group);
    neck.position.set(0, torsoY + th / 2 + headLift / 2 - 0.02, def.headZ + 0.08);
    const hornGeo = new THREE.BoxGeometry(0.05, 0.16, 0.05);
    hornGeo.translate(0, 0.08, 0); // pivot at the base
    for (const ex of [-1, 1]) {
      const horn = detail(hornGeo, leg, headMesh);
      horn.position.set(ex * 0.08, hh / 2 - 0.02, 0.05);
      horn.rotation.x = 0.7; // swept back over the neck
    }
  } else {
    // Hopper: lighter throat patch on the head front, ears folded back flat.
    const patch = detail(
      new THREE.BoxGeometry(0.18, 0.14, 0.05),
      mat(new THREE.Color(def.headColor).multiplyScalar(1.35)),
      headMesh,
    );
    patch.position.set(0, -hh / 2 + 0.05, -hd / 2 - 0.015);
    const earGeo = new THREE.BoxGeometry(0.09, 0.16, 0.04);
    earGeo.translate(0, 0.08, 0); // pivot at the base
    for (const ex of [-1, 1]) {
      const ear = detail(earGeo, head, headMesh);
      ear.position.set(ex * (hw / 2 - 0.06), hh / 2 - 0.01, 0);
      ear.rotation.x = 1.35; // folded flat toward the back
    }
  }

  // Four legs, geometry shifted so the mesh pivots at the hip. Hoppers get
  // big splayed feet: wider leg boxes nudged toward the toes.
  const legs: THREE.Mesh[] = [];
  const lw = def.legW;
  const hops = species === Species.hopper;
  const legGeo = new THREE.BoxGeometry(hops ? lw + 0.1 : lw, def.legLen, hops ? lw + 0.12 : lw);
  legGeo.translate(0, -def.legLen / 2, hops ? -0.04 : 0);
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const mesh = new THREE.Mesh(legGeo, leg);
    mesh.name = 'entity';
    mesh.position.set(sx * (tw / 2 - lw / 2 - 0.02), def.legLen, sz * (td / 2 - lw / 2 - 0.05));
    group.add(mesh);
    legs.push(mesh);
  }
  return { group, torso, head: headMesh, legs, mats };
}

export class AnimalSystem {
  readonly animals: Animal[] = [];
  private world: WorldView | null = null;
  private biomeFn: BiomeFn | null = null;
  private spawnEnabled = true;
  private spawnTimer = 0;
  private readonly moveResult: MoveResult = { hitX: false, hitY: false, hitZ: false };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly random: () => number = Math.random,
  ) {}

  /** Bind to a world (session start) — clears any previous population. */
  setWorld(world: WorldView | null): void {
    this.clear();
    this.world = world;
  }

  /** Biome lookup for species selection; null falls back to random species. */
  setBiomeFn(fn: BiomeFn | null): void {
    this.biomeFn = fn;
  }

  /** Pause/resume ambient spawning (existing animals keep updating). */
  setSpawning(enabled: boolean): void {
    this.spawnEnabled = enabled;
  }

  clear(): void {
    for (const animal of this.animals) this.scene.remove(animal.group);
    this.animals.length = 0;
    this.spawnTimer = 0;
  }

  get count(): number {
    return this.animals.length;
  }

  /** Place an animal directly (also the test seam). */
  spawnAt(x: number, y: number, z: number, species?: SpeciesId): Animal {
    const sp = species ?? (this.random() < 0.5 ? Species.trundler : Species.woolly);
    const parts = makeAnimalMesh(sp);
    // Per-individual size variety — purely visual: the collision AABB stays
    // ANIMAL_HALF_WIDTH × ANIMAL_HEIGHT for every animal.
    const size = SIZE_MIN + this.random() * (SIZE_MAX - SIZE_MIN);
    parts.group.scale.set(size, size, size);
    const animal: Animal = {
      body: createBody(x, y, z),
      species: sp,
      yaw: this.random() * Math.PI * 2,
      hp: ANIMAL_HP,
      moving: false,
      timer: 0.5 + this.random() * 2,
      phase: 0,
      dying: 0,
      flash: 0,
      kbX: 0,
      kbZ: 0,
      group: parts.group,
      legs: parts.legs,
      torso: parts.torso,
      head: parts.head,
      mats: parts.mats,
    };
    this.scene.add(animal.group);
    this.animals.push(animal);
    return animal;
  }

  /**
   * Top-down scan of column (x, z): the y an animal would stand at (one above
   * the surface block), or null when the column is empty or its surface is
   * not spawnable grass/snow (sand/stone/water).
   */
  private surfaceY(world: WorldView, x: number, z: number): number | null {
    for (let y = 120; y >= 1; y--) {
      const id = world.getBlock(x, y, z);
      if (id === Block.air) continue;
      return id === Block.grass || id === Block.snow ? y + 1 : null;
    }
    return null;
  }

  /** Herd scatter offset: ±1..HERD_SCATTER blocks (never 0, so mates don't stack). */
  private scatter(): number {
    const mag = 1 + Math.floor(this.random() * HERD_SCATTER);
    return this.random() < 0.5 ? -mag : mag;
  }

  /**
   * Try to spawn a small herd (2-4, all one species) on grass or snow near
   * the player. Species follows the biome: woollies in the snowy cold,
   * trundlers in temperate green, striders in deserts, hoppers in jungles.
   * Herd-mates scatter ±1..3 blocks around the lead animal, each dropped onto
   * its own column's surface; unspawnable columns are skipped, and the herd
   * is truncated at MAX_ANIMALS.
   */
  private trySpawn(px: number, pz: number): void {
    const world = this.world;
    if (!world || this.animals.length >= MAX_ANIMALS) return;
    const angle = this.random() * Math.PI * 2;
    const dist = SPAWN_MIN_DIST + this.random() * (SPAWN_MAX_DIST - SPAWN_MIN_DIST);
    const x = Math.floor(px + Math.cos(angle) * dist);
    const z = Math.floor(pz + Math.sin(angle) * dist);
    const y = this.surfaceY(world, x, z);
    if (y === null) return;
    const biome = this.biomeFn ? this.biomeFn(x, z) : -1;
    const species = speciesForBiome(biome, this.random);
    const herd = HERD_MIN + Math.floor(this.random() * (HERD_MAX - HERD_MIN + 1));
    this.spawnAt(x + 0.5, y, z + 0.5, species);
    for (let i = 1; i < herd && this.animals.length < MAX_ANIMALS; i++) {
      const hx = x + this.scatter();
      const hz = z + this.scatter();
      const hy = this.surfaceY(world, hx, hz);
      if (hy === null) continue; // e.g. a water or sand pocket beside the lead
      this.spawnAt(hx + 0.5, hy, hz + 0.5, species);
    }
  }

  fixedUpdate(dt: number, px: number, py: number, pz: number): void {
    const world = this.world;
    if (!world) return;
    if (this.spawnEnabled) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = SPAWN_INTERVAL_S;
        this.trySpawn(px, pz);
      }
    }
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const animal = this.animals[i];
      if (!animal) continue;
      if (animal.dying > 0) {
        // Death pop: no AI or movement — shrink toward nothing, then despawn.
        animal.dying -= dt;
        if (animal.dying <= 0) {
          this.scene.remove(animal.group);
          this.animals.splice(i, 1);
        } else {
          const s = Math.max(DYING_MIN_SCALE, animal.group.scale.x * Math.max(0, 1 - dt * DYING_SHRINK));
          animal.group.scale.set(s, s, s);
        }
        continue;
      }
      const body = animal.body;
      const dx = body.x - px;
      const dz = body.z - pz;
      if (dx * dx + dz * dz > DESPAWN_DIST * DESPAWN_DIST || body.y < -10) {
        this.scene.remove(animal.group);
        this.animals.splice(i, 1);
        continue;
      }
      this.step(animal, world, dt);
      animal.group.position.set(body.x, body.y, body.z);
      animal.group.rotation.set(0, animal.yaw, 0);
      this.animate(animal, dt);
    }
    void py;
  }

  /** Leg gait + torso roll while walking, idle head bob, and the hurt flash. */
  private animate(animal: Animal, dt: number): void {
    const settle = Math.max(0, 1 - dt * 10);
    if (animal.moving && animal.body.onGround) {
      animal.phase += dt * 7;
      const swing = Math.sin(animal.phase) * 0.7;
      for (let l = 0; l < animal.legs.length; l++) {
        // Diagonal pairs move together (0,3 vs 1,2), like a real gait.
        animal.legs[l]?.rotation.set(l === 0 || l === 3 ? swing : -swing, 0, 0);
      }
      // Slight body roll synced to the gait; the head steadies while trotting.
      animal.torso.rotation.z = Math.sin(animal.phase) * WALK_ROLL;
      animal.head.rotation.x *= settle;
    } else {
      // Idle life: the phase creeps on, gently tilting/bobbing the head.
      for (const leg of animal.legs) leg.rotation.x *= settle;
      animal.phase += dt * IDLE_BOB_RATE;
      animal.head.rotation.x = Math.sin(animal.phase) * IDLE_BOB_TILT;
      animal.torso.rotation.z *= settle;
    }
    if (animal.flash > 0) {
      animal.flash -= dt;
      const on = animal.flash > 0;
      for (const m of animal.mats) m.emissive.setRGB(on ? 0.55 : 0, 0, 0);
    }
  }

  /** Centroid of same-species animals within FLOCK_RADIUS, or null if alone. */
  private herdCentroid(self: Animal): { x: number; z: number } | null {
    let sx = 0;
    let sz = 0;
    let n = 0;
    for (const other of this.animals) {
      if (other === self || other.species !== self.species) continue;
      const dx = other.body.x - self.body.x;
      const dz = other.body.z - self.body.z;
      if (dx * dx + dz * dz <= FLOCK_RADIUS * FLOCK_RADIUS) {
        sx += other.body.x;
        sz += other.body.z;
        n++;
      }
    }
    return n > 0 ? { x: sx / n, z: sz / n } : null;
  }

  private step(animal: Animal, world: WorldView, dt: number): void {
    const body = animal.body;
    animal.timer -= dt;
    if (animal.timer <= 0) {
      // Cohesion: most decisions, steer toward nearby herd-mates; else roam.
      const herd = this.random() < FLOCK_CHANCE ? this.herdCentroid(animal) : null;
      if (herd && (herd.x !== body.x || herd.z !== body.z)) {
        animal.yaw = Math.atan2(-(herd.x - body.x), -(herd.z - body.z));
        animal.moving = true;
      } else {
        animal.moving = this.random() < 0.6;
        animal.yaw = this.random() * Math.PI * 2;
      }
      animal.timer = 1 + this.random() * 3;
    }
    const speed = animal.moving ? WALK_SPEED : 0;
    body.vx = -Math.sin(animal.yaw) * speed + animal.kbX;
    body.vz = -Math.cos(animal.yaw) * speed + animal.kbZ;
    const kbDecay = Math.max(0, 1 - dt * 5);
    animal.kbX *= kbDecay;
    animal.kbZ *= kbDecay;
    const inWater = world.getBlock(Math.floor(body.x), Math.floor(body.y + 0.1), Math.floor(body.z)) === Block.water;
    if (inWater) {
      body.vy = Math.min(2, body.vy + 12 * dt); // buoyancy
    } else {
      body.vy -= GRAVITY * dt;
      if (body.vy < -TERMINAL_VELOCITY) body.vy = -TERMINAL_VELOCITY;
    }
    moveBody(
      world.isSolid,
      body,
      body.vx * dt,
      body.vy * dt,
      body.vz * dt,
      this.moveResult,
      ANIMAL_HALF_WIDTH,
      ANIMAL_HEIGHT,
    );
    // Hop over single-block obstacles when walking into them.
    if (animal.moving && body.onGround && (this.moveResult.hitX || this.moveResult.hitZ)) {
      body.vy = HOP_VELOCITY;
    }
  }

  /** Nearest living animal hit by the ray within maxDist, or null. */
  raycastNearest(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDist: number,
  ): { animal: Animal; distance: number } | null {
    let best: Animal | null = null;
    let bestT = maxDist;
    for (const animal of this.animals) {
      if (animal.dying > 0) continue; // carcasses mid-pop can't be targeted
      const b = animal.body;
      const t = rayAABB(
        ox, oy, oz, dx, dy, dz,
        b.x - ANIMAL_HALF_WIDTH, b.y, b.z - ANIMAL_HALF_WIDTH,
        b.x + ANIMAL_HALF_WIDTH, b.y + ANIMAL_HEIGHT, b.z + ANIMAL_HALF_WIDTH,
      );
      if (t !== null && t <= bestT) {
        best = animal;
        bestT = t;
      }
    }
    return best ? { animal: best, distance: bestT } : null;
  }

  /**
   * Punch an animal; returns its drops when it dies, else null. (kx, kz) is
   * the attack direction for knockback (defaults keep old callers working).
   * Drops are yielded on the lethal hit itself; the body then plays a brief
   * shrinking death pop before fixedUpdate removes it from scene and array.
   */
  hurt(animal: Animal, kx = 0, kz = 0): { id: number; count: number } | null {
    if (animal.dying > 0) return null; // already slain — no double drops
    animal.hp--;
    if (animal.hp <= 0) {
      animal.dying = DYING_S;
      return { id: Item.meat, count: 1 + (this.random() < 0.5 ? 1 : 0) };
    }
    animal.body.vy = 5; // flinch hop
    animal.flash = 0.22;
    animal.kbX = kx * 7;
    animal.kbZ = kz * 7;
    return null;
  }
}
