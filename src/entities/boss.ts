/**
 * The great bosses of Voxelheim. A spec table drives one shared fight engine —
 * three escalating phases (chase & slam → summon adds → enraged), telegraphed
 * ground slams, knockback resistance, a dramatic collapse and a loot fountain.
 * One boss lives at a time; the system drives the boss bar and reuses the
 * entity AABB physics and skin/flash conventions.
 *
 *  - The Sunken King: summoned deep underground (y<30) by a Sovereign Totem.
 *  - The Stone Colossus: roams the surface near ancient region-seeded anchors —
 *    walk up to one and the fight simply begins.
 *
 * Phase math and the loot rolls are pure and unit-tested; mesh/AI live here.
 */
import * as THREE from 'three';
import { Item } from '../world/items';
import { Block } from '../world/blocks';
import { rayAABB } from '../world/raycast';
import {
  createBody,
  GRAVITY,
  moveBody,
  TERMINAL_VELOCITY,
  type Body,
  type MoveResult,
} from '../player/physics';
import { hideMaterial, shadowBlob } from './skins';
import type { WorldView } from '../player/controller';

export const BOSS_HALF_WIDTH = 0.9;
export const BOSS_HEIGHT = 3.2;
export const BOSS_HP = 180;
/** y below which the totem will summon (the deep dark). */
export const BOSS_SUMMON_MAX_Y = 94;
const LEASH_RANGE = 26; // never strays far from the summon arena
const DESPAWN_DIST = 90; // player this far away ends the fight (boss leaves)
const HOP_VELOCITY = 8;
const KNOCKBACK_RESIST = 0.15; // the King barely flinches
const SUMMON_COOLDOWN_S = 6; // phase-2 adds cadence
const LUNGE_S = 0.35;
const DYING_S = 1.2; // a long, dramatic collapse
const DYING_SHRINK = 3;
const DYING_MIN_SCALE = 0.05;

/** Boss phase from a current/max HP fraction: 3 enraged, 2 summoner, 1 opener. */
export function bossPhase(hp: number, maxHp: number): 1 | 2 | 3 {
  const frac = hp / maxHp;
  if (frac <= 1 / 3) return 3;
  if (frac <= 2 / 3) return 2;
  return 1;
}

/**
 * The loot fountain a slain King showers, given a 0..1 roll supplier (pure).
 * Always the crown trophy and the kingsplitter greataxe, plus a burst of
 * gems and gold — an unmistakable reward pile.
 */
export function bossLoot(random: () => number): Array<{ id: number; count: number }> {
  const drops: Array<{ id: number; count: number }> = [
    { id: Item.crown, count: 1 },
    { id: Item.kingsplitter, count: 1 },
  ];
  const gems = 6 + Math.floor(random() * 5); // 6-10 gems
  const gold = 8 + Math.floor(random() * 6); // 8-13 gold
  for (let i = 0; i < gems; i++) drops.push({ id: Item.gem, count: 1 });
  for (let i = 0; i < gold; i++) drops.push({ id: Item.goldIngot, count: 1 });
  return drops;
}

/**
 * The Colossus' hoard (pure): its molten heart and the earthshaker maul,
 * plus a landslide of iron, gems and crystal shards.
 */
export function colossusLoot(random: () => number): Array<{ id: number; count: number }> {
  const drops: Array<{ id: number; count: number }> = [
    { id: Item.titanHeart, count: 1 },
    { id: Item.earthshaker, count: 1 },
  ];
  const iron = 8 + Math.floor(random() * 5); // 8-12 iron
  const gems = 5 + Math.floor(random() * 4); // 5-8 gems
  const crystal = 3 + Math.floor(random() * 3); // 3-5 crystal
  for (let i = 0; i < iron; i++) drops.push({ id: Item.ingot, count: 1 });
  for (let i = 0; i < gems; i++) drops.push({ id: Item.gem, count: 1 });
  for (let i = 0; i < crystal; i++) drops.push({ id: Block.crystal, count: 1 });
  return drops;
}

/**
 * The Tyrant's boost hoard (pure): its unblinking eye, heartstones that
 * permanently grow the player's health, and a scatter of dusk metal and gems.
 */
export function tyrantLoot(random: () => number): Array<{ id: number; count: number }> {
  const drops: Array<{ id: number; count: number }> = [{ id: Item.tyrantEye, count: 1 }];
  const hearts = 2 + Math.floor(random() * 2); // 2-3 heartstones
  const dusk = 4 + Math.floor(random() * 4); // 4-7 dusksteel
  const gems = 5 + Math.floor(random() * 4); // 5-8 gems
  for (let i = 0; i < hearts; i++) drops.push({ id: Item.heartstone, count: 1 });
  for (let i = 0; i < dusk; i++) drops.push({ id: Item.duskIngot, count: 1 });
  for (let i = 0; i < gems; i++) drops.push({ id: Item.gem, count: 1 });
  return drops;
}

/**
 * The Monarch's hoard (pure): the Nightsever — the strongest weapon in the
 * game — its cinder crown, and a king's ransom of metal, gems and hearts.
 */
export function monarchLoot(random: () => number): Array<{ id: number; count: number }> {
  const drops: Array<{ id: number; count: number }> = [
    { id: Item.nightsever, count: 1 },
    { id: Item.ashcrown, count: 1 },
    { id: Item.heartstone, count: 1 },
    { id: Item.heartstone, count: 1 },
  ];
  const dusk = 6 + Math.floor(random() * 4); // 6-9 dusksteel
  const gems = 8 + Math.floor(random() * 5); // 8-12 gems
  const gold = 6 + Math.floor(random() * 4); // 6-9 gold
  for (let i = 0; i < dusk; i++) drops.push({ id: Item.duskIngot, count: 1 });
  for (let i = 0; i < gems; i++) drops.push({ id: Item.gem, count: 1 });
  for (let i = 0; i < gold; i++) drops.push({ id: Item.goldIngot, count: 1 });
  return drops;
}

export type BossKind = 'sunkenKing' | 'stoneColossus' | 'hollowTyrant' | 'ashenMonarch';

/** Everything that makes one great boss distinct — the engine reads only this. */
export interface BossSpec {
  readonly name: string;
  readonly hp: number;
  readonly halfWidth: number;
  readonly height: number;
  readonly speed: number;
  readonly enragedSpeed: number;
  readonly slamRange: number;
  readonly slamDamage: number;
  readonly slamCooldown: number;
  readonly enragedCooldown: number;
  readonly loot: (random: () => number) => Array<{ id: number; count: number }>;
}

export const BOSS_SPECS: Record<BossKind, BossSpec> = {
  sunkenKing: {
    name: 'The Sunken King',
    hp: BOSS_HP,
    halfWidth: BOSS_HALF_WIDTH,
    height: BOSS_HEIGHT,
    speed: 2.0,
    enragedSpeed: 3.4,
    slamRange: 3.0,
    slamDamage: 6,
    slamCooldown: 2.4,
    enragedCooldown: 1.4,
    loot: bossLoot,
  },
  stoneColossus: {
    name: 'The Stone Colossus',
    hp: 240,
    halfWidth: 1.1,
    height: 4.2,
    speed: 1.7, // ponderous...
    enragedSpeed: 3.0, // ...until the mountain wakes up
    slamRange: 3.6,
    slamDamage: 8,
    slamCooldown: 2.6,
    enragedCooldown: 1.5,
    loot: colossusLoot,
  },
  hollowTyrant: {
    name: 'The Hollow Tyrant',
    hp: 210,
    halfWidth: 0.85,
    height: 3.6,
    speed: 2.6, // the fastest of the great bosses...
    enragedSpeed: 4.0, // ...and terrifying once enraged
    slamRange: 2.8,
    slamDamage: 7,
    slamCooldown: 2.0,
    enragedCooldown: 1.2,
    loot: tyrantLoot,
  },
  // The end of the game: the underworld's molten emperor.
  ashenMonarch: {
    name: 'The Ashen Monarch',
    hp: 400,
    halfWidth: 1.4,
    height: 5.4,
    speed: 2.2,
    enragedSpeed: 3.6,
    slamRange: 4.2,
    slamDamage: 10,
    slamCooldown: 2.2,
    enragedCooldown: 1.1,
    loot: monarchLoot,
  },
};

export interface Boss {
  readonly kind: BossKind;
  readonly spec: BossSpec;
  readonly body: Body;
  yaw: number;
  hp: number;
  attackCd: number;
  summonCd: number;
  phase: 1 | 2 | 3;
  /** Integrated stride phase — position-independent, so no diagonal freeze. */
  walkPhase: number;
  lunge: number;
  /** Telegraph seconds remaining before the slam lands (0 = not winding). */
  windup: number;
  flash: number;
  dying: number;
  kbX: number;
  kbZ: number;
  readonly group: THREE.Group;
  readonly torso: THREE.Mesh;
  readonly limbs: readonly THREE.Mesh[];
  readonly mats: readonly THREE.MeshLambertMaterial[];
}

const crownGeometry = new THREE.BoxGeometry(0.7, 0.18, 0.7);
const crownMaterial = new THREE.MeshBasicMaterial({ color: 0xe6be4a });
const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xb060e0 });

/** Terse detail-mesh helper shared by every boss rig. */
function part(
  parent: THREE.Object3D,
  material: THREE.Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rz = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.name = 'entity';
  m.position.set(x, y, z);
  if (rz !== 0) m.rotation.z = rz;
  parent.add(m);
  return m;
}

/** Build the King's rig: a colossal crowned brute, ~3.2 blocks tall. */
function makeBossMesh(): { group: THREE.Group; torso: THREE.Mesh; limbs: THREE.Mesh[]; mats: THREE.MeshLambertMaterial[] } {
  const hide = hideMaterial(0x4a4658, 'stone'); // deep violet-grey
  const limbMat = hideMaterial(0x363348, 'stone');
  const crownRim = hideMaterial(0xc8a53c, 'stone');
  const group = new THREE.Group();
  group.name = 'entity';

  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.5, 1.0), hide);
  torso.name = 'entity';
  torso.position.set(0, 1.9, 0);
  group.add(torso);
  group.add(shadowBlob(1.2));

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), hide);
  head.name = 'entity';
  head.position.set(0, 2.95, -0.05);
  group.add(head);
  // A jagged crown of gold ringing the head, plus violet eyes.
  const crown = new THREE.Mesh(crownGeometry, crownMaterial);
  crown.name = 'entity';
  crown.position.set(0, 3.4, -0.05);
  group.add(crown);
  const crownBand = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.16, 0.92), crownRim);
  crownBand.name = 'entity';
  crownBand.position.set(0, 3.28, -0.05);
  group.add(crownBand);
  for (const ex of [-0.22, 0.22]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.05), eyeMaterial);
    eye.name = 'entity';
    eye.position.set(ex, 2.98, -0.5);
    group.add(eye);
  }

  // [legL, legR, armL, armR] — hip/shoulder pivots.
  const limbs: THREE.Mesh[] = [];
  const legGeo = new THREE.BoxGeometry(0.6, 1.15, 0.66);
  legGeo.translate(0, -0.575, 0);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, limbMat);
    leg.name = 'entity';
    leg.position.set(sx * 0.45, 1.15, 0);
    group.add(leg);
    limbs.push(leg);
  }
  const armGeo = new THREE.BoxGeometry(0.42, 1.5, 0.46);
  armGeo.translate(0, -0.75, 0);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, limbMat);
    arm.name = 'entity';
    arm.position.set(sx * 1.06, 2.6, 0);
    group.add(arm);
    limbs.push(arm);
    // Massive fists.
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.62), hide);
    fist.name = 'entity';
    fist.position.set(0, -1.6, 0);
    arm.add(fist);
  }
  // DEFINITION pass: a royal violet chest sigil, gold trim bands, spiked
  // pauldrons and a tattered back-cape slab — a drowned king in regalia.
  part(group, eyeMaterial, 0.5, 0.5, 0.05, 0, 2.0, -0.53); // glowing sigil
  part(group, crownRim, 1.75, 0.14, 1.05, 0, 2.72, 0); // gold collar
  part(group, crownRim, 1.72, 0.12, 1.02, 0, 1.2, 0); // gold belt
  for (const sx of [-1, 1]) {
    part(group, limbMat, 0.55, 0.28, 0.7, sx * 1.06, 2.85, 0); // pauldrons
    part(group, crownRim, 0.14, 0.45, 0.14, sx * 1.18, 3.2, 0, sx * 0.3); // gold spikes
  }
  part(group, limbMat, 1.3, 1.7, 0.14, 0, 2.0, 0.58); // tattered cape slab
  return { group, torso, limbs, mats: [hide, limbMat, crownRim] };
}

const colossusEyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffb340 });

/** The Colossus rig: a ~4.2-block weathered granite titan capped in moss. */
function makeColossusMesh(): { group: THREE.Group; torso: THREE.Mesh; limbs: THREE.Mesh[]; mats: readonly THREE.MeshLambertMaterial[] } {
  const granite = hideMaterial(0x6d6a5f, 'stone');
  const limbMat = hideMaterial(0x585549, 'stone');
  const moss = hideMaterial(0x4e6b3a, 'stone');
  const group = new THREE.Group();
  group.name = 'entity';

  const torso = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.9, 1.3), granite);
  torso.name = 'entity';
  torso.position.set(0, 2.5, 0);
  group.add(torso);
  group.add(shadowBlob(1.5));

  const head = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 1.0), granite);
  head.name = 'entity';
  head.position.set(0, 3.85, -0.05);
  group.add(head);
  // Mossy crown slab, a heavy stone brow, and two burning amber eyes.
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.16, 1.08), moss);
  cap.name = 'entity';
  cap.position.set(0, 4.36, -0.05);
  group.add(cap);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.2), limbMat);
  brow.name = 'entity';
  brow.position.set(0, 4.05, -0.5);
  group.add(brow);
  for (const ex of [-0.24, 0.24]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.05), colossusEyeMaterial);
    eye.name = 'entity';
    eye.position.set(ex, 3.88, -0.54);
    group.add(eye);
  }

  // [legL, legR, armL, armR] — hip/shoulder pivots.
  const limbs: THREE.Mesh[] = [];
  const legGeo = new THREE.BoxGeometry(0.75, 1.55, 0.8);
  legGeo.translate(0, -0.775, 0);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, limbMat);
    leg.name = 'entity';
    leg.position.set(sx * 0.55, 1.55, 0);
    group.add(leg);
    limbs.push(leg);
  }
  const armGeo = new THREE.BoxGeometry(0.55, 2.0, 0.6);
  armGeo.translate(0, -1.0, 0);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, limbMat);
    arm.name = 'entity';
    arm.position.set(sx * 1.4, 3.3, 0);
    group.add(arm);
    limbs.push(arm);
    // Moss-capped pauldrons and boulder fists.
    const pauldron = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.22, 0.74), moss);
    pauldron.name = 'entity';
    pauldron.position.set(0, 0.12, 0);
    arm.add(pauldron);
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.82), granite);
    fist.name = 'entity';
    fist.position.set(0, -2.15, 0);
    arm.add(fist);
  }
  // DEFINITION pass: amber rune-cracks glow through the granite, moss drapes
  // hang off the flanks, and a rubble ridge runs down the spine.
  part(group, colossusEyeMaterial, 0.1, 1.2, 0.05, -0.5, 2.6, -0.68); // rune crack L
  part(group, colossusEyeMaterial, 0.1, 0.9, 0.05, 0.6, 2.4, -0.68, -0.15); // rune crack R
  part(group, colossusEyeMaterial, 0.9, 0.1, 0.05, 0, 1.75, -0.68); // belt rune
  for (const sx of [-1, 1]) {
    part(group, moss, 0.18, 1.1, 1.0, sx * 1.18, 2.4, 0); // moss drapes
  }
  for (let i = 0; i < 3; i++) {
    part(group, limbMat, 0.35, 0.4 + i * 0.15, 0.35, 0, 3.55 + i * 0.28, 0.62 - i * 0.08); // spine rubble
  }
  return { group, torso, limbs, mats: [granite, limbMat, moss] };
}

const tyrantEyeMaterial = new THREE.MeshBasicMaterial({ color: 0xf2f0ff });

/** The Tyrant rig: a gaunt ~3.6-block shade, all shroud, claws and pale eyes. */
function makeTyrantMesh(): { group: THREE.Group; torso: THREE.Mesh; limbs: THREE.Mesh[]; mats: readonly THREE.MeshLambertMaterial[] } {
  const shroud = hideMaterial(0x241f30, 'cloth');
  const limbMat = hideMaterial(0x18141f, 'cloth');
  const bone = hideMaterial(0x8a8494, 'stone');
  const group = new THREE.Group();
  group.name = 'entity';

  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, 0.7), shroud);
  torso.name = 'entity';
  torso.position.set(0, 2.1, 0);
  group.add(torso);
  group.add(shadowBlob(1.1));

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.75, 0.7), shroud);
  head.name = 'entity';
  head.position.set(0, 3.25, -0.02);
  group.add(head);
  // A cracked bone circlet and wide, pale, unblinking eyes.
  const circlet = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.12, 0.76), bone);
  circlet.name = 'entity';
  circlet.position.set(0, 3.62, -0.02);
  group.add(circlet);
  for (const ex of [-0.17, 0.17]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.05), tyrantEyeMaterial);
    eye.name = 'entity';
    eye.position.set(ex, 3.3, -0.37);
    group.add(eye);
  }

  // [legL, legR, armL, armR] — long, spindly limbs with bone claws.
  const limbs: THREE.Mesh[] = [];
  const legGeo = new THREE.BoxGeometry(0.32, 1.3, 0.36);
  legGeo.translate(0, -0.65, 0);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, limbMat);
    leg.name = 'entity';
    leg.position.set(sx * 0.28, 1.3, 0);
    group.add(leg);
    limbs.push(leg);
  }
  const armGeo = new THREE.BoxGeometry(0.26, 1.7, 0.3);
  armGeo.translate(0, -0.85, 0);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, limbMat);
    arm.name = 'entity';
    arm.position.set(sx * 0.7, 2.85, 0);
    group.add(arm);
    limbs.push(arm);
    const claw = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.38), bone);
    claw.name = 'entity';
    claw.position.set(0, -1.85, 0);
    arm.add(claw);
  }
  // DEFINITION pass: pale rib slats over the shroud, ragged skirt tatters,
  // and bone shoulder knobs — a starved horror, not a plain shade.
  for (let i = 0; i < 3; i++) {
    part(group, bone, 0.85 - i * 0.12, 0.07, 0.05, 0, 2.45 - i * 0.28, -0.37); // rib slats
  }
  for (const sx of [-1, 1]) {
    part(group, bone, 0.3, 0.22, 0.34, sx * 0.7, 3.0, 0); // shoulder knobs
    part(group, limbMat, 0.26, 0.7, 0.1, sx * 0.35, 1.05, -0.28, sx * 0.12); // skirt tatters F
    part(group, limbMat, 0.26, 0.6, 0.1, sx * 0.3, 1.0, 0.28, sx * -0.1); // skirt tatters B
  }
  part(group, tyrantEyeMaterial, 0.4, 0.06, 0.05, 0, 2.1, -0.37); // pale waist gleam
  return { group, torso, limbs, mats: [shroud, limbMat, bone] };
}

const monarchCoreMaterial = new THREE.MeshBasicMaterial({ color: 0xff7a28 });
const monarchEyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffd23e });

/** The Monarch rig: a ~5.4-block obsidian emperor cracked with molten light. */
function makeMonarchMesh(): { group: THREE.Group; torso: THREE.Mesh; limbs: THREE.Mesh[]; mats: readonly THREE.MeshLambertMaterial[] } {
  const obsidian = hideMaterial(0x1c1a22, 'stone');
  const limbMat = hideMaterial(0x141218, 'stone');
  const cinder = hideMaterial(0x5a2c1a, 'stone');
  const group = new THREE.Group();
  group.name = 'entity';

  const torso = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.4, 1.5), obsidian);
  torso.name = 'entity';
  torso.position.set(0, 3.1, 0);
  group.add(torso);
  group.add(shadowBlob(1.8));
  // The molten core burning through the chest.
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.1), monarchCoreMaterial);
  core.name = 'entity';
  core.position.set(0, 3.3, -0.78);
  group.add(core);

  const head = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 1.3), obsidian);
  head.name = 'entity';
  head.position.set(0, 4.85, -0.05);
  group.add(head);
  // Twin swept horns, a cinder crown band, furnace eyes.
  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.24), limbMat);
    horn.name = 'entity';
    horn.position.set(sx * 0.5, 5.6, -0.1);
    horn.rotation.set(0, 0, sx * -0.35);
    group.add(horn);
  }
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.18, 1.36), cinder);
  band.name = 'entity';
  band.position.set(0, 5.28, -0.05);
  group.add(band);
  for (const ex of [-0.3, 0.3]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.06), monarchEyeMaterial);
    eye.name = 'entity';
    eye.position.set(ex, 4.9, -0.71);
    group.add(eye);
  }

  // [legL, legR, armL, armR] — pillar legs, furnace-gauntlet arms.
  const limbs: THREE.Mesh[] = [];
  const legGeo = new THREE.BoxGeometry(0.9, 1.9, 0.95);
  legGeo.translate(0, -0.95, 0);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, limbMat);
    leg.name = 'entity';
    leg.position.set(sx * 0.7, 1.9, 0);
    group.add(leg);
    limbs.push(leg);
  }
  const armGeo = new THREE.BoxGeometry(0.7, 2.4, 0.75);
  armGeo.translate(0, -1.2, 0);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, limbMat);
    arm.name = 'entity';
    arm.position.set(sx * 1.78, 4.1, 0);
    group.add(arm);
    limbs.push(arm);
    const gauntlet = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.85, 1.0), cinder);
    gauntlet.name = 'entity';
    gauntlet.position.set(0, -2.55, 0);
    arm.add(gauntlet);
    const emberKnuckle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.1), monarchCoreMaterial);
    emberKnuckle.name = 'entity';
    emberKnuckle.position.set(0, -2.55, -0.56);
    arm.add(emberKnuckle);
  }
  // DEFINITION pass: molten seams crack the whole body, spiked pauldrons
  // crown the shoulders, a jagged back-ridge rises behind the head, and
  // plate ridges band the torso — an emperor, not a box, from any angle.
  part(group, monarchCoreMaterial, 0.14, 2.2, 0.06, -0.7, 3.1, -0.79); // torso seam L
  part(group, monarchCoreMaterial, 0.14, 1.7, 0.06, 0.75, 3.0, -0.79, 0.12); // torso seam R
  part(group, monarchCoreMaterial, 1.6, 0.12, 0.06, 0, 2.25, -0.79); // belt seam
  part(group, cinder, 2.9, 0.22, 1.55, 0, 4.15, 0); // collar plate
  part(group, cinder, 2.85, 0.18, 1.52, 0, 2.6, 0); // waist plate
  for (const sx of [-1, 1]) {
    part(group, cinder, 0.95, 0.35, 1.1, sx * 1.75, 4.42, 0); // pauldrons
    part(group, limbMat, 0.2, 0.75, 0.2, sx * 1.95, 4.95, 0, sx * 0.35); // pauldron spikes
    part(group, monarchCoreMaterial, 0.1, 0.5, 0.05, sx * 0.72, 1.35, -0.5); // leg seams
  }
  for (let i = 0; i < 3; i++) {
    part(group, limbMat, 0.22, 0.6 + i * 0.25, 0.22, (i - 1) * 0.55, 4.35 + i * 0.12, 0.75, (i - 1) * 0.2); // back ridge
  }
  return { group, torso, limbs, mats: [obsidian, limbMat, cinder] };
}

const BOSS_MESH: Record<BossKind, () => { group: THREE.Group; torso: THREE.Mesh; limbs: THREE.Mesh[]; mats: readonly THREE.MeshLambertMaterial[] }> = {
  sunkenKing: makeBossMesh,
  stoneColossus: makeColossusMesh,
  hollowTyrant: makeTyrantMesh,
  ashenMonarch: makeMonarchMesh,
};

/** Callback: spawn one hostile add near (x, y, z) — main bridges to HostileSystem. */
export type AddSpawner = (x: number, y: number, z: number) => void;
/** Callback: drop one loot stack at (x, y, z). */
export type LootDropper = (id: number, count: number, x: number, y: number, z: number) => void;

/** A burning floor patch the Ashen Monarch leaves behind (phase 2+). */
interface EmberHazard {
  x: number;
  y: number;
  z: number;
  ttl: number;
  /** Seconds until the next damage tick for a player standing in it. */
  tick: number;
  /** Seconds until the next particle emission. */
  emit: number;
}

const HAZARD_TTL_S = 6;
const HAZARD_RADIUS = 1.7;
const HAZARD_DAMAGE = 2;
const HAZARD_TICK_S = 0.8;
const HAZARD_EMIT_S = 0.12;

export class BossSystem {
  private boss: Boss | null = null;
  private readonly moveResult: MoveResult = { hitX: false, hitY: false, hitZ: false };
  private hazards: EmberHazard[] = [];
  /** Fired the moment a lethal blow lands (before the collapse finishes). */
  onSlain: ((kind: BossKind) => void) | null = null;
  /** A hazard smoulders at (x, y, z) — main puffs embers there. */
  onHazard: ((x: number, y: number, z: number) => void) | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly random: () => number = Math.random,
  ) {}

  get active(): boolean {
    return this.boss !== null && this.boss.dying <= 0;
  }

  /** 0..1 remaining health of the live boss (0 when none). */
  get healthFraction(): number {
    return this.boss ? Math.max(0, this.boss.hp / this.boss.spec.hp) : 0;
  }

  get name(): string {
    return this.boss?.spec.name ?? '';
  }

  get phase(): 1 | 2 | 3 {
    return this.boss?.phase ?? 1;
  }

  /** Live boss hitbox dims (king-sized fallback for the aim outline). */
  get halfWidth(): number {
    return this.boss?.spec.halfWidth ?? BOSS_HALF_WIDTH;
  }

  get height(): number {
    return this.boss?.spec.height ?? BOSS_HEIGHT;
  }

  /** Summon a great boss at (x, y, z); refuses if one is already alive. */
  summon(x: number, y: number, z: number, kind: BossKind = 'sunkenKing'): boolean {
    if (this.boss) return false;
    const parts = BOSS_MESH[kind]();
    this.boss = {
      kind,
      spec: BOSS_SPECS[kind],
      body: createBody(x, y, z),
      yaw: 0,
      hp: BOSS_SPECS[kind].hp,
      attackCd: 1.5,
      summonCd: SUMMON_COOLDOWN_S,
      phase: 1,
      walkPhase: 0,
      lunge: 0,
      windup: 0,
      flash: 0,
      dying: 0,
      kbX: 0,
      kbZ: 0,
      group: parts.group,
      torso: parts.torso,
      limbs: parts.limbs,
      mats: parts.mats,
    };
    this.scene.add(parts.group);
    return true;
  }

  clear(): void {
    if (this.boss) this.scene.remove(this.boss.group);
    this.boss = null;
    this.hazards = [];
  }

  fixedUpdate(
    dt: number,
    world: WorldView,
    px: number,
    py: number,
    pz: number,
    hitPlayer: (damage: number) => void,
    spawnAdd: AddSpawner,
    dropLoot: LootDropper,
  ): void {
    // Ember hazards burn on even while the boss is mid-collapse.
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      if (!h) continue;
      h.ttl -= dt;
      if (h.ttl <= 0) {
        this.hazards.splice(i, 1);
        continue;
      }
      h.emit -= dt;
      if (h.emit <= 0) {
        h.emit = HAZARD_EMIT_S;
        this.onHazard?.(h.x + (this.random() - 0.5) * 2, h.y + 0.2, h.z + (this.random() - 0.5) * 2);
      }
      h.tick -= dt;
      const hdx = px - h.x;
      const hdz = pz - h.z;
      if (h.tick <= 0 && hdx * hdx + hdz * hdz < HAZARD_RADIUS * HAZARD_RADIUS && Math.abs(py - h.y) < 2.2) {
        hitPlayer(HAZARD_DAMAGE);
        h.tick = HAZARD_TICK_S;
      }
    }

    const b = this.boss;
    if (!b) return;

    if (b.dying > 0) {
      b.dying -= dt;
      b.group.scale.setScalar(Math.max(DYING_MIN_SCALE, b.group.scale.x - dt * DYING_SHRINK * 0.25));
      if (b.dying <= 0) {
        // Loot fountain, then leave.
        for (const drop of b.spec.loot(this.random)) dropLoot(drop.id, drop.count, b.body.x, b.body.y + 1, b.body.z);
        this.scene.remove(b.group);
        this.boss = null;
      }
      return;
    }

    const dx = px - b.body.x;
    const dz = pz - b.body.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > DESPAWN_DIST * DESPAWN_DIST || b.body.y < -20) {
      this.clear();
      return;
    }

    b.phase = bossPhase(b.hp, b.spec.hp);
    const enraged = b.phase === 3;
    const speed = enraged ? b.spec.enragedSpeed : b.spec.speed;
    const horiz = Math.max(0.001, Math.hypot(dx, dz));
    b.yaw = Math.atan2(dx, dz);
    b.body.vx = (dx / horiz) * speed + b.kbX;
    b.body.vz = (dz / horiz) * speed + b.kbZ;
    const kbDecay = Math.max(0, 1 - dt * 6);
    b.kbX *= kbDecay;
    b.kbZ *= kbDecay;

    // Ground slam: TELEGRAPHED. The lean-forward runs before the blow, and
    // stepping out of reach during the tell makes even a boss whiff.
    if (b.attackCd > 0) b.attackCd -= dt;
    if (b.windup > 0) {
      b.windup -= dt;
      if (b.windup <= 0) {
        if (distSq < b.spec.slamRange * b.spec.slamRange * 1.7 && Math.abs(b.body.y - py) < 3.4) {
          hitPlayer(b.spec.slamDamage);
          b.attackCd = enraged ? b.spec.enragedCooldown : b.spec.slamCooldown;
        } else {
          b.attackCd = 0.6;
        }
        // CATACLYSM: from phase 2 the Monarch's slams crack the floor into
        // burning ember patches — the arena itself becomes the hazard.
        if (b.kind === 'ashenMonarch' && b.phase >= 2) {
          this.hazards.push({ x: px, y: py, z: pz, ttl: HAZARD_TTL_S, tick: 0.4, emit: 0 });
        }
      }
    } else if (b.attackCd <= 0 && distSq < b.spec.slamRange * b.spec.slamRange && Math.abs(b.body.y - py) < 3) {
      b.windup = enraged ? 0.28 : 0.42; // enraged bosses swing faster
      b.lunge = b.windup + LUNGE_S;
    }

    // Phase 2+: periodically summon adds around the arena.
    if (b.phase >= 2) {
      b.summonCd -= dt;
      if (b.summonCd <= 0) {
        b.summonCd = SUMMON_COOLDOWN_S;
        const n = enraged ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          spawnAdd(b.body.x + Math.cos(a) * 3, b.body.y + 1, b.body.z + Math.sin(a) * 3);
        }
      }
    }

    // Leash: never wander far from the arena centre (the summon spot drifts
    // with the boss, but the despawn distance caps the fight radius).
    void LEASH_RANGE;

    b.body.vy -= GRAVITY * dt;
    if (b.body.vy < -TERMINAL_VELOCITY) b.body.vy = -TERMINAL_VELOCITY;
    moveBody(world.isSolid, b.body, b.body.vx * dt, b.body.vy * dt, b.body.vz * dt, this.moveResult, b.spec.halfWidth, b.spec.height);
    if (b.body.onGround && (this.moveResult.hitX || this.moveResult.hitZ)) b.body.vy = HOP_VELOCITY;

    b.group.position.set(b.body.x, b.body.y, b.body.z);
    b.group.rotation.set(0, b.yaw, 0);
    this.animate(b, dt);
  }

  private animate(b: Boss, dt: number): void {
    const speed = Math.hypot(b.body.vx, b.body.vz);
    b.walkPhase += speed * dt * 2.2;
    const swing = Math.sin(b.walkPhase) * Math.min(0.6, speed * 0.3);
    b.limbs[0]?.rotation.set(swing, 0, 0);
    b.limbs[1]?.rotation.set(-swing, 0, 0);
    b.limbs[2]?.rotation.set(-swing * 0.7, 0, 0);
    b.limbs[3]?.rotation.set(swing * 0.7, 0, 0);
    if (b.lunge > 0) {
      b.lunge -= dt;
      b.torso.rotation.set(Math.min(1, Math.max(0, b.lunge / LUNGE_S)) * 0.4, 0, 0);
    } else {
      b.torso.rotation.set(0, 0, 0);
    }
    if (b.flash > 0) {
      b.flash -= dt;
      const on = b.flash > 0;
      for (const m of b.mats) m.emissive.setRGB(on ? 0.5 : 0, 0, on ? 0.15 : 0);
    }
  }

  raycastNearest(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDist: number,
  ): { boss: Boss; distance: number } | null {
    const b = this.boss;
    if (!b || b.dying > 0) return null;
    const t = rayAABB(
      ox, oy, oz, dx, dy, dz,
      b.body.x - b.spec.halfWidth, b.body.y, b.body.z - b.spec.halfWidth,
      b.body.x + b.spec.halfWidth, b.body.y + b.spec.height, b.body.z + b.spec.halfWidth,
    );
    return t !== null && t <= maxDist ? { boss: b, distance: t } : null;
  }

  /** Strike the boss. Returns true when this blow is lethal (starts the collapse). */
  hurt(boss: Boss, damage: number, kx = 0, kz = 0): boolean {
    if (boss.dying > 0) return false;
    boss.hp -= damage;
    boss.flash = 0.18;
    boss.kbX = kx * KNOCKBACK_RESIST;
    boss.kbZ = kz * KNOCKBACK_RESIST;
    if (boss.hp <= 0) {
      boss.hp = 0;
      boss.dying = DYING_S;
      this.onSlain?.(boss.kind);
      return true;
    }
    return false;
  }
}
