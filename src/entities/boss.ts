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
import { hideMaterial } from './skins';
import type { WorldView } from '../player/controller';

export const BOSS_HALF_WIDTH = 0.9;
export const BOSS_HEIGHT = 3.2;
export const BOSS_HP = 180;
/** y below which the totem will summon (the deep dark). */
export const BOSS_SUMMON_MAX_Y = 30;
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

export type BossKind = 'sunkenKing' | 'stoneColossus';

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
  lunge: number;
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
  return { group, torso, limbs, mats: [granite, limbMat, moss] };
}

const BOSS_MESH: Record<BossKind, () => { group: THREE.Group; torso: THREE.Mesh; limbs: THREE.Mesh[]; mats: readonly THREE.MeshLambertMaterial[] }> = {
  sunkenKing: makeBossMesh,
  stoneColossus: makeColossusMesh,
};

/** Callback: spawn one hostile add near (x, y, z) — main bridges to HostileSystem. */
export type AddSpawner = (x: number, y: number, z: number) => void;
/** Callback: drop one loot stack at (x, y, z). */
export type LootDropper = (id: number, count: number, x: number, y: number, z: number) => void;

export class BossSystem {
  private boss: Boss | null = null;
  private readonly moveResult: MoveResult = { hitX: false, hitY: false, hitZ: false };
  /** Fired the moment a lethal blow lands (before the collapse finishes). */
  onSlain: ((kind: BossKind) => void) | null = null;

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
      lunge: 0,
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

    // Ground slam when in reach and off cooldown.
    if (b.attackCd > 0) b.attackCd -= dt;
    if (b.attackCd <= 0 && distSq < b.spec.slamRange * b.spec.slamRange && Math.abs(b.body.y - py) < 3) {
      hitPlayer(b.spec.slamDamage);
      b.attackCd = enraged ? b.spec.enragedCooldown : b.spec.slamCooldown;
      b.lunge = LUNGE_S;
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
    const swing = Math.sin((b.body.x + b.body.z) * 1.4) * Math.min(0.6, speed * 0.3);
    b.limbs[0]?.rotation.set(swing, 0, 0);
    b.limbs[1]?.rotation.set(-swing, 0, 0);
    b.limbs[2]?.rotation.set(-swing * 0.7, 0, 0);
    b.limbs[3]?.rotation.set(swing * 0.7, 0, 0);
    if (b.lunge > 0) {
      b.lunge -= dt;
      b.torso.rotation.set(Math.max(0, b.lunge / LUNGE_S) * 0.4, 0, 0);
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
