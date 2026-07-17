/**
 * Passive animals: blocky critters that wander the grass near the player,
 * hop over obstacles, float in water, and can be hunted for meat. Physics
 * reuses the AABB sweep with entity dimensions; rendering is a per-species
 * rig of Lambert boxes (torso/head/legs plus character details like tails,
 * ears, horns, antler racks, fleece and necks), finished with 2-4 patch
 * markings rolled per individual so herd-mates aren't clones. Six species
 * cover the biomes: trundlers and woollies share temperate ground, striders
 * roam deserts, hoppers the jungles, bramblehorn stags the forests and
 * dustpuffs the savanna. Idle animals sometimes graze head-down, tails wag
 * on the move, legs pace with actual ground speed, and hurting one panics
 * its nearby herd into a brief bolt. Not persisted — ambient wildlife
 * respawns around the player in small same-species herds with per-individual
 * size variety; slain animals play a brief shrinking "death pop" before
 * leaving the scene.
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
import { hideMaterial } from './skins';

export type BiomeFn = (wx: number, wz: number) => number;

export const ANIMAL_HALF_WIDTH = 0.35;
export const ANIMAL_HEIGHT = 0.7;
export const ANIMAL_HP = 3;
/** Population cap for the ambient wildlife around the player. */
export const MAX_ANIMALS = 48;
const SPAWN_INTERVAL_S = 0.8;
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
const GAIT_BASE = 3; // leg-swing phase rate floor while moving (rad/s)…
const GAIT_PER_SPEED = 2.4; // …plus this much per block/s of ground speed
const GAIT_MIN_SPEED = 0.2; // slides slower than this read as standing
const TAIL_WAG = 0.3; // lateral tail swing amplitude while moving (radians)
const HEAD_EASE = 8; // per-second easing rate of the head toward its pose
const GRAZE_CHANCE = 0.35; // per idle decision, odds of dropping into a graze
const GRAZE_MIN_S = 2; // graze duration range (seconds)
const GRAZE_MAX_S = 4;
const GRAZE_PITCH = 0.5; // head-down pitch toward the grass (radians)
const GRAZE_NIBBLE = 0.06; // nibble oscillation riding the graze pitch
const GRAZE_NIBBLE_RATE = 2.2; // nibble frequency multiplier on the idle phase
const PANIC_RADIUS = 8; // a hurt animal spooks same-species mates within this
const PANIC_KB = 0.6; // herd-mates receive this fraction of the knockback
const PANIC_S = 2; // spooked animals bolt away for this long
/** Patch markings are this thick, centred on the torso face: 0.02 proud. */
const PATCH_T = 0.04;

/** Passive species — biome-flavoured visual variety; all drop meat. */
export const Species = {
  trundler: 0,
  woolly: 1,
  strider: 2,
  hopper: 3,
  bramblehorn: 4,
  dustpuff: 5,
  // Weird wildlife — rare cross-biome oddities that turn up anywhere.
  thornback: 6, // low spiky reptile with a ridge of back plates and a long tail
  puffle: 7, // an absurd round fuzzball on stubby legs, face on the front
  stiltback: 8, // a spindly daddy-longlegs: tiny body atop very tall thin legs
  // Underworld wildlife — ash-born creatures that only roam the other realm.
  cinderpup: 9, // a soot-dark pup with ember-orange markings
  ashcrawler: 10, // a low, wide, pale crawler hugging the cavern floor
} as const;
export type SpeciesId = (typeof Species)[keyof typeof Species];

/** The weird species, spawned rarely regardless of biome ("everywhere"). */
export const WEIRD_SPECIES: readonly SpeciesId[] = [Species.thornback, Species.puffle, Species.stiltback];
const WEIRD_CHANCE = 0.16; // per spawn attempt, roll a weird one instead

/** The ash-born species of the underworld (spawned only in that realm). */
export const UNDERWORLD_SPECIES: readonly SpeciesId[] = [Species.cinderpup, Species.ashcrawler];

/** Skittish species bolt when the player closes within FLEE_RADIUS. */
const SKITTISH = new Set<SpeciesId>([Species.bramblehorn, Species.dustpuff, Species.stiltback]);
const FLEE_RADIUS = 5;

/**
 * Species-special lethal drops: hearty stags, treasure-bearing oddities and
 * ember-blooded cinderpups. Everything else falls through to plain meat.
 */
const SPECIES_DROP: Partial<Record<SpeciesId, (r: () => number) => { id: number; count: number }>> = {
  [Species.bramblehorn]: (r) => ({ id: Item.meat, count: 2 + (r() < 0.5 ? 1 : 0) }),
  [Species.thornback]: (r) => (r() < 0.3 ? { id: Item.gem, count: 1 } : { id: Item.meat, count: 2 }),
  [Species.puffle]: (r) => (r() < 0.3 ? { id: Item.gem, count: 1 } : { id: Item.meat, count: 2 }),
  [Species.stiltback]: (r) => (r() < 0.3 ? { id: Item.gem, count: 1 } : { id: Item.meat, count: 2 }),
  [Species.cinderpup]: () => ({ id: Item.emberShard, count: 1 }),
};

interface SpeciesDef {
  readonly torso: readonly [number, number, number];
  readonly head: readonly [number, number, number];
  /** Head centre offset from the torso front. */
  readonly headZ: number;
  readonly legLen: number;
  readonly legW: number;
  readonly bodyColor: number;
  readonly headColor: number;
  /** Secondary hue for the per-individual patch markings. */
  readonly patchColor: number;
  /** Leg-swing frequency multiplier — scurriers cycle faster at any speed. */
  readonly gait: number;
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
    patchColor: 0x8a6a42,
    gait: 1,
  },
  [Species.woolly]: {
    torso: [0.62, 0.5, 0.66],
    head: [0.3, 0.28, 0.28],
    headZ: -0.42,
    legLen: 0.26,
    legW: 0.15,
    bodyColor: 0xddd6c4,
    headColor: 0xc8bfa8,
    patchColor: 0xb9ae94,
    gait: 1,
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
    patchColor: 0xb3924e,
    gait: 1,
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
    patchColor: 0x4f7134,
    gait: 1,
  },
  // Forest bramblehorn: deer-like — tall slim legs, raised neck, antler rack.
  [Species.bramblehorn]: {
    torso: [0.46, 0.34, 0.72],
    head: [0.24, 0.22, 0.26],
    headZ: -0.42,
    legLen: 0.5,
    legW: 0.09,
    bodyColor: 0x8f5a34,
    headColor: 0x7c4d2c,
    patchColor: 0xd9c49b,
    gait: 1,
  },
  // Savanna dustpuff: tiny round scurrier — ball torso, big ears, no neck.
  [Species.dustpuff]: {
    torso: [0.4, 0.38, 0.42],
    head: [0.26, 0.24, 0.24],
    headZ: -0.26,
    legLen: 0.14,
    legW: 0.1,
    bodyColor: 0xdcb968,
    headColor: 0xcfa956,
    patchColor: 0xa8823c,
    gait: 1.9,
  },
  // Thornback: a low, wide reptile — flat torso close to the ground, small
  // sunk head, splayed stubby legs; a back ridge + long tail come from its rig.
  [Species.thornback]: {
    torso: [0.62, 0.3, 0.9],
    head: [0.3, 0.24, 0.3],
    headZ: -0.5,
    legLen: 0.2,
    legW: 0.11,
    bodyColor: 0x5e6b3a,
    headColor: 0x4c5730,
    patchColor: 0x3f4a28,
    gait: 1.3,
  },
  // Puffle: an absurd fuzzball — a big near-cubic torso, a face tucked into
  // the front, tiny legs. Head box is tiny (the face rides the torso).
  [Species.puffle]: {
    torso: [0.7, 0.62, 0.7],
    head: [0.3, 0.24, 0.14],
    headZ: -0.36,
    legLen: 0.12,
    legW: 0.13,
    bodyColor: 0xc98bd0,
    headColor: 0xb06ab8,
    patchColor: 0xdca8e0,
    gait: 2.4,
  },
  // Stiltback: a spindly strider — a tiny high torso on very long thin legs.
  [Species.stiltback]: {
    torso: [0.3, 0.24, 0.44],
    head: [0.22, 0.2, 0.24],
    headZ: -0.28,
    legLen: 0.78,
    legW: 0.05,
    bodyColor: 0x6b6f86,
    headColor: 0x565a72,
    patchColor: 0x8a8fa8,
    gait: 1.1,
  },
  // Cinderpup: a soot-dark scamp whose patches glow ember-orange.
  [Species.cinderpup]: {
    torso: [0.44, 0.34, 0.5],
    head: [0.3, 0.28, 0.28],
    headZ: -0.32,
    legLen: 0.2,
    legW: 0.11,
    bodyColor: 0x3a3038,
    headColor: 0x2e2a30,
    patchColor: 0xff8a3a,
    gait: 1.6,
  },
  // Ashcrawler: a low, wide, bone-pale crawler hugging the cavern floor.
  [Species.ashcrawler]: {
    torso: [0.66, 0.26, 0.86],
    head: [0.28, 0.22, 0.28],
    headZ: -0.5,
    legLen: 0.16,
    legW: 0.12,
    bodyColor: 0x8d8a80,
    headColor: 0x767268,
    patchColor: 0x5c5850,
    gait: 1.4,
  },
};

/**
 * Which species belongs in a biome (pure). Deserts breed striders, jungles
 * hoppers and snowfields woollies; forests mix bramblehorn stags (60%) with
 * trundlers (40%); savannas mix dustpuffs (50%), woollies (30%) and
 * trundlers (20%); temperate ground keeps the classic trundler/woolly blend.
 */
export function speciesForBiome(biome: number, random: () => number): SpeciesId {
  if (biome === Biome.desert) return Species.strider;
  if (biome === Biome.jungle) return Species.hopper;
  if (biome === Biome.snowy) return Species.woolly;
  if (biome === Biome.forest) {
    return random() < 0.6 ? Species.bramblehorn : Species.trundler;
  }
  if (biome === Biome.savanna) {
    const roll = random();
    return roll < 0.5 ? Species.dustpuff : roll < 0.8 ? Species.woolly : Species.trundler;
  }
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
  /** Graze seconds remaining; > 0 while idle-grazing (head down, nibbling). */
  graze: number;
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
  /** Head mesh — tilts/bobs while idle, dips to graze (face details ride along). */
  readonly head: THREE.Mesh;
  /** Tail mesh — wags laterally while moving; null for tailless species. */
  readonly tail: THREE.Mesh | null;
  /** Per-animal material clones, so the hurt flash never tints the herd. */
  readonly mats: readonly THREE.MeshLambertMaterial[];
}

/** Shared face materials/geometry — never flash, so one instance serves all. */
const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x1c1c22 });
const eyeWhiteMaterial = new THREE.MeshBasicMaterial({ color: 0xf2efe6 });
const noseMaterial = new THREE.MeshBasicMaterial({ color: 0x241d18 });
const eyeWhiteGeometry = new THREE.BoxGeometry(0.11, 0.1, 0.03);
const pupilGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.025);
const mouthGeometry = new THREE.BoxGeometry(0.14, 0.03, 0.02);
/** Rare coat variants: ghost-pale or shadow-dark individuals. */
const VARIANT_CHANCE = 0.05;
/** Shared eye geometry — identical across every species. */

/**
 * Build a species rig. `random` seeds the per-individual patch markings
 * (count, faces and jitter), so identical rng tapes rebuild identical coats.
 */
function makeAnimalMesh(
  species: SpeciesId,
  random: () => number,
): {
  group: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Mesh;
  tail: THREE.Mesh | null;
  legs: THREE.Mesh[];
  mats: THREE.MeshLambertMaterial[];
} {
  const def = SPECIES[species];
  const mats: THREE.MeshLambertMaterial[] = [];
  /** Per-animal furred Lambert clone, registered so the hurt flash tints it. */
  const mat = (color: THREE.Color | number): THREE.MeshLambertMaterial => {
    const m = hideMaterial(color, 'fur');
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
  // Per-individual coat tint: every animal rolls its own shade around the
  // species colour, and ~5% are rare ghost-pale or shadow-dark variants — no
  // two herd-mates look alike.
  const variantRoll = random();
  const shade =
    variantRoll < VARIANT_CHANCE
      ? random() < 0.5
        ? 0.55
        : 1.45
      : 0.85 + random() * 0.3;
  const tinted = (color: number, extra = 1): THREE.Color =>
    new THREE.Color(color).multiplyScalar(shade * extra);
  const head = mat(tinted(def.headColor));
  const leg = mat(tinted(def.bodyColor, 0.72));
  // Woollies wear their fleece as a second, slightly lighter torso material.
  const body = mat(tinted(def.bodyColor, species === Species.woolly ? 1.12 : 1));
  const group = new THREE.Group();
  group.name = 'entity';

  const [tw, th, td] = def.torso;
  const torsoY = def.legLen + th / 2;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(tw, th, td), body);
  torso.name = 'entity';
  torso.position.set(0, torsoY, 0);

  const [hw, hh, hd] = def.head;
  // Striders and bramblehorns carry the head on a raised neck; the dustpuff
  // ball tucks its head straight into the torso front; others keep it snug.
  const headLift =
    species === Species.strider
      ? 0.34
      : species === Species.bramblehorn
        ? 0.3
        : species === Species.stiltback
          ? 0.28
          : 0;
  const headNudge = species === Species.dustpuff || species === Species.puffle ? 0.02 : 0.12;
  const headY = torsoY + th / 2 - hh / 2 + headNudge + headLift;
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(hw, hh, hd), head);
  headMesh.name = 'entity';
  headMesh.position.set(0, headY, def.headZ);
  group.add(torso, headMesh);

  // FACE: two-layer eyes (white + pupil) that actually read at distance, a
  // species-toned muzzle with a dark nose tip, and a thin mouth line — all
  // children of the head so idle tilts and grazes carry the whole face.
  // (Puffles wear their face on the torso instead; see their branch.)
  if (species !== Species.puffle) {
    const eyeScale = species === Species.stiltback ? 0.6 : 1;
    for (const ex of [-1, 1]) {
      const white = detail(eyeWhiteGeometry, eyeWhiteMaterial, headMesh);
      white.position.set(ex * (hw / 2 - 0.04), 0.04, -hd / 2 - 0.012);
      white.scale.set(eyeScale, eyeScale, 1);
      const pupil = detail(pupilGeometry, eyeMaterial, headMesh);
      pupil.position.set(ex * (hw / 2 - 0.04) - ex * 0.012, 0.035, -hd / 2 - 0.026);
      pupil.scale.set(eyeScale, eyeScale, 1);
    }
    // Muzzle: a slightly darker snout box low on the face, nose tip + mouth.
    const muzzle = detail(
      new THREE.BoxGeometry(hw * 0.55, hh * 0.42, 0.08),
      mat(tinted(def.headColor, 0.82)),
      headMesh,
    );
    muzzle.position.set(0, -hh * 0.22, -hd / 2 - 0.03);
    const nose = detail(new THREE.BoxGeometry(0.07, 0.05, 0.02), noseMaterial, muzzle);
    nose.position.set(0, hh * 0.1, -0.05);
    const mouth = detail(mouthGeometry, noseMaterial, muzzle);
    mouth.position.set(0, -hh * 0.13, -0.045);
  }

  let tail: THREE.Mesh | null = null;
  if (species === Species.trundler) {
    // Stubby up-angled tail plus two small rounded ear nubs.
    tail = detail(new THREE.BoxGeometry(0.14, 0.12, 0.22), body, group);
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
    tail = detail(new THREE.BoxGeometry(0.16, 0.16, 0.12), body, group);
    tail.position.set(0, torsoY + th * 0.2, td / 2 + 0.04);
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
  } else if (species === Species.hopper) {
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
  } else if (species === Species.bramblehorn) {
    // Slim neck to the raised head, a pale chest patch, a flag tail, and a
    // rack of antlers: per side one back-swept beam branching into 3 tines.
    const pale = mat(0xe8dcc4);
    const neck = detail(new THREE.BoxGeometry(0.12, headLift + 0.26, 0.14), body, group);
    neck.position.set(0, torsoY + th / 2 + headLift / 2 - 0.02, def.headZ + 0.1);
    const chest = detail(new THREE.BoxGeometry(0.24, 0.18, PATCH_T), pale, torso);
    chest.position.set(0, -th * 0.15, -td / 2);
    tail = detail(new THREE.BoxGeometry(0.08, 0.16, 0.07), pale, group);
    tail.position.set(0, torsoY + th * 0.3, td / 2 + 0.03);
    tail.rotation.x = -0.5; // little raised flag
    const antler = mat(0xcbb287);
    const beamGeo = new THREE.BoxGeometry(0.035, 0.34, 0.035);
    beamGeo.translate(0, 0.17, 0); // pivot at the base
    const tineGeo = new THREE.BoxGeometry(0.03, 0.15, 0.03);
    tineGeo.translate(0, 0.075, 0);
    for (const ex of [-1, 1]) {
      const beam = detail(beamGeo, antler, headMesh);
      beam.position.set(ex * (hw / 2 - 0.03), hh / 2 - 0.02, 0.04);
      beam.rotation.set(0.55, 0, ex * 0.3); // swept back, splayed outward
      for (let t = 0; t < 3; t++) {
        const tine = detail(tineGeo, antler, beam);
        tine.position.set(0, 0.1 + t * 0.09, 0);
        tine.rotation.set(-0.8, 0, ex * (0.25 + t * 0.1)); // branch forward
      }
    }
  } else if (species === Species.dustpuff) {
    // Dustpuff: big upright ears with dark tips and a tiny tail puff on the
    // ball torso — the head has no neck at all, tucked into the body front.
    const tipMat = mat(0x584428);
    const earGeo = new THREE.BoxGeometry(0.12, 0.2, 0.045);
    earGeo.translate(0, 0.1, 0); // pivot at the base
    for (const ex of [-1, 1]) {
      const ear = detail(earGeo, head, headMesh);
      ear.position.set(ex * (hw / 2 - 0.04), hh / 2 - 0.02, 0.02);
      ear.rotation.z = ex * -0.15; // splayed slightly outward
      const tip = detail(new THREE.BoxGeometry(0.125, 0.06, 0.05), tipMat, ear);
      tip.position.set(0, 0.18, 0);
    }
    tail = detail(new THREE.BoxGeometry(0.09, 0.09, 0.08), body, group);
    tail.position.set(0, torsoY + th * 0.15, td / 2 + 0.03);
  } else if (species === Species.thornback) {
    // A ridge of five back plates growing along the spine, and a long
    // tapering tail dragging behind — a spiky low reptile.
    const spikeMat = mat(0x8a5a2c);
    for (let i = 0; i < 5; i++) {
      const s = 0.16 - i * 0.02;
      const plate = detail(new THREE.BoxGeometry(0.06, s, 0.1), spikeMat, torso);
      plate.position.set(0, th / 2 + s / 2 - 0.02, td / 2 - 0.18 - i * 0.16);
      plate.rotation.x = -0.2;
    }
    // Segmented tail: three shrinking boxes off the rear.
    let seg = detail(new THREE.BoxGeometry(0.2, 0.16, 0.24), body, group);
    seg.position.set(0, torsoY - 0.02, td / 2 + 0.12);
    for (let i = 0; i < 2; i++) {
      const nseg = detail(new THREE.BoxGeometry(0.14 - i * 0.04, 0.12 - i * 0.03, 0.22), body, group);
      nseg.position.set(0, torsoY - 0.04 - i * 0.02, td / 2 + 0.32 + i * 0.2);
      tail = nseg;
      void seg;
      seg = nseg;
    }
  } else if (species === Species.puffle) {
    // A fuzzy round body: a fluff cap over the top and a big expressive face
    // right on the torso front — oversized two-layer eyes and a tiny mouth.
    const fluff = detail(new THREE.BoxGeometry(tw + 0.08, 0.16, td + 0.08), body, torso);
    fluff.position.set(0, th / 2 + 0.02, 0);
    for (const ex of [-0.17, 0.17]) {
      const white = detail(eyeWhiteGeometry, eyeWhiteMaterial, torso);
      white.position.set(ex, 0.08, -td / 2 - 0.012);
      white.scale.set(1.5, 1.5, 1);
      const pupil = detail(pupilGeometry, eyeMaterial, torso);
      pupil.position.set(ex - Math.sign(ex) * 0.02, 0.07, -td / 2 - 0.028);
      pupil.scale.set(1.4, 1.4, 1);
    }
    const mouth = detail(mouthGeometry, noseMaterial, torso);
    mouth.position.set(0, -0.12, -td / 2 - 0.015);
  } else if (species === Species.stiltback) {
    // A twiggy neck lifts a small head; long thin legs come from the rig.
    const neck = detail(new THREE.BoxGeometry(0.06, 0.3, 0.06), body, group);
    neck.position.set(0, torsoY + th / 2 + 0.1, def.headZ + 0.14);
    // Long thin antennae flicking up from the head.
    const antGeo = new THREE.BoxGeometry(0.02, 0.22, 0.02);
    antGeo.translate(0, 0.11, 0);
    for (const ex of [-1, 1]) {
      const ant = detail(antGeo, head, headMesh);
      ant.position.set(ex * 0.05, hh / 2, 0.02);
      ant.rotation.set(-0.3, 0, ex * 0.4);
    }
  }

  // Patterning: 2-4 thin patches (spots/saddle/stripe) in a secondary hue,
  // scattered over the torso surface (centred on the face, so 0.02 proud)
  // with per-individual jitter — herd-mates never share the same coat.
  const patchMat = mat(def.patchColor);
  const patchCount = 2 + Math.floor(random() * 3);
  for (let i = 0; i < patchCount; i++) {
    const face = Math.floor(random() * 3); // 0 = back, 1 = left, 2 = right
    const w = 0.08 + random() * 0.08;
    const d = 0.1 + random() * 0.12;
    const jitterA = random() - 0.5;
    const jitterB = random() - 0.5;
    if (face === 0) {
      const patch = detail(new THREE.BoxGeometry(w, PATCH_T, d), patchMat, torso);
      patch.position.set(jitterA * (tw - w - 0.04), th / 2, jitterB * (td - d - 0.04));
    } else {
      const patch = detail(new THREE.BoxGeometry(PATCH_T, w, d), patchMat, torso);
      patch.position.set((face === 1 ? -1 : 1) * (tw / 2), jitterA * (th - w - 0.04), jitterB * (td - d - 0.04));
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
  return { group, torso, head: headMesh, tail, legs, mats };
}

export class AnimalSystem {
  readonly animals: Animal[] = [];
  private world: WorldView | null = null;
  private biomeFn: BiomeFn | null = null;
  private realm: 'overworld' | 'underworld' = 'overworld';
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

  /** Which realm's wildlife to spawn (surfaces + species both follow). */
  setRealm(realm: 'overworld' | 'underworld'): void {
    this.realm = realm;
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

  /**
   * Place an animal directly (also the test seam). Rolls the individual's
   * patch markings and visual size from this system's rng.
   */
  spawnAt(x: number, y: number, z: number, species?: SpeciesId): Animal {
    const sp = species ?? (this.random() < 0.5 ? Species.trundler : Species.woolly);
    const parts = makeAnimalMesh(sp, this.random);
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
      graze: 0,
      dying: 0,
      flash: 0,
      kbX: 0,
      kbZ: 0,
      group: parts.group,
      legs: parts.legs,
      torso: parts.torso,
      head: parts.head,
      tail: parts.tail,
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
      // Overworld herds keep to grass and snow; ash-born wildlife stands on
      // the underworld's ashstone and emberrock floors.
      if (this.realm === 'underworld') {
        return id === Block.ashstone || id === Block.emberrock ? y + 1 : null;
      }
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
   * the player. Species follows the biome via speciesForBiome: woollies in
   * the snowy cold, trundlers in temperate green, striders in deserts,
   * hoppers in jungles, bramblehorns in forests, dustpuffs on the savanna.
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
    // Most spawns follow the biome; a rare roll drops a weird oddity instead,
    // so bizarre wildlife turns up in every biome ("everywhere"). The
    // underworld breeds only its own ash-born species.
    const species =
      this.realm === 'underworld'
        ? this.random() < 0.6
          ? Species.cinderpup
          : Species.ashcrawler
        : this.random() < WEIRD_CHANCE
          ? WEIRD_SPECIES[Math.floor(this.random() * WEIRD_SPECIES.length)] ?? Species.thornback
          : speciesForBiome(biome, this.random);
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
      // Skittish species notice an approaching player and bolt away —
      // stags, dustpuffs and stiltbacks can no longer be walked up to.
      if (
        SKITTISH.has(animal.species) &&
        animal.timer < PANIC_S && // don't re-steer an already-fleeing animal
        dx * dx + dz * dz < FLEE_RADIUS * FLEE_RADIUS
      ) {
        animal.yaw = Math.atan2(-dx, -dz); // away from the player (panic convention)
        animal.moving = true;
        animal.timer = PANIC_S;
        animal.graze = 0;
      }
      this.step(animal, world, dt);
      animal.group.position.set(body.x, body.y, body.z);
      animal.group.rotation.set(0, animal.yaw, 0);
      this.animate(animal, dt);
    }
    void py;
  }

  /**
   * Leg gait paced by actual horizontal speed (so knockback slides and flee
   * bolts read correctly), torso roll and tail wag while moving, idle head
   * bob or graze nibble at rest, and the hurt flash.
   */
  private animate(animal: Animal, dt: number): void {
    const settle = Math.max(0, 1 - dt * 10);
    const ease = Math.min(1, dt * HEAD_EASE);
    const speed = Math.hypot(animal.body.vx, animal.body.vz);
    if (speed > GAIT_MIN_SPEED && animal.body.onGround) {
      // Swing frequency tracks ground speed; scurriers pace it up further.
      animal.phase += dt * (GAIT_BASE + speed * GAIT_PER_SPEED) * SPECIES[animal.species].gait;
      const swing = Math.sin(animal.phase) * 0.7;
      for (let l = 0; l < animal.legs.length; l++) {
        // Diagonal pairs move together (0,3 vs 1,2), like a real gait.
        animal.legs[l]?.rotation.set(l === 0 || l === 3 ? swing : -swing, 0, 0);
      }
      // Slight body roll synced to the gait; the head steadies while trotting.
      animal.torso.rotation.z = Math.sin(animal.phase) * WALK_ROLL;
      animal.head.rotation.x *= settle;
      if (animal.tail) animal.tail.rotation.y = Math.sin(animal.phase * 0.9) * TAIL_WAG;
    } else {
      // Idle life: the phase creeps on, bobbing the head — or, mid-graze,
      // easing it down toward the grass with a small nibble oscillation.
      for (const leg of animal.legs) leg.rotation.x *= settle;
      animal.phase += dt * IDLE_BOB_RATE;
      const target =
        animal.graze > 0
          ? -GRAZE_PITCH + Math.sin(animal.phase * GRAZE_NIBBLE_RATE) * GRAZE_NIBBLE
          : Math.sin(animal.phase) * IDLE_BOB_TILT;
      animal.head.rotation.x += (target - animal.head.rotation.x) * ease;
      animal.torso.rotation.z *= settle;
      if (animal.tail) animal.tail.rotation.y *= settle;
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
      // Some idle decisions settle into a leisurely head-down graze.
      if (!animal.moving && this.random() < GRAZE_CHANCE) {
        animal.graze = GRAZE_MIN_S + this.random() * (GRAZE_MAX_S - GRAZE_MIN_S);
      }
    }
    if (animal.moving) animal.graze = 0; // moving always cancels a graze
    else if (animal.graze > 0) animal.graze = Math.max(0, animal.graze - dt);
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
   * A non-lethal directional hit panics the victim into a PANIC_S bolt away
   * from the attacker and spreads the impulse — at PANIC_KB strength — to
   * same-species herd-mates within PANIC_RADIUS, so the whole herd scatters.
   * Drops are yielded on the lethal hit itself; the body then plays a brief
   * shrinking death pop before fixedUpdate removes it from scene and array.
   */
  hurt(animal: Animal, kx = 0, kz = 0, damage = 1): { id: number; count: number } | null {
    if (animal.dying > 0) return null; // already slain — no double drops
    animal.hp -= damage;
    if (animal.hp <= 0) {
      animal.dying = DYING_S;
      const special = SPECIES_DROP[animal.species];
      return special ? special(this.random) : { id: Item.meat, count: 1 + (this.random() < 0.5 ? 1 : 0) };
    }
    animal.body.vy = 5; // flinch hop
    animal.flash = 0.22;
    animal.kbX = kx * 7;
    animal.kbZ = kz * 7;
    if (kx !== 0 || kz !== 0) {
      // Herd panic: everyone bolts along the push, away from the attacker.
      const away = Math.atan2(-kx, -kz);
      animal.yaw = away;
      animal.moving = true;
      animal.timer = PANIC_S;
      animal.graze = 0;
      for (const other of this.animals) {
        if (other === animal || other.species !== animal.species || other.dying > 0) continue;
        const dx = other.body.x - animal.body.x;
        const dz = other.body.z - animal.body.z;
        if (dx * dx + dz * dz > PANIC_RADIUS * PANIC_RADIUS) continue;
        other.kbX = kx * 7 * PANIC_KB;
        other.kbZ = kz * 7 * PANIC_KB;
        other.yaw = away;
        other.moving = true;
        other.timer = PANIC_S;
        other.graze = 0;
      }
    }
    return null;
  }
}
