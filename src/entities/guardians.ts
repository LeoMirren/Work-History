/**
 * Dungeon guardians ("vault brutes"): heavy melee mobs that haunt buried
 * dungeons so the loot inside is earned. The system probes chunks around the
 * player through an injected dungeon locator (main binds the worldgen dungeon
 * seed; tests pass fakes) and keeps a pair of brutes alive per nearby vault,
 * each tagged to its dungeon and leashed to the room centre — they lurk, they
 * don't hunt. Physics reuses the entity AABB sweep, targeting the shared
 * ray-pick/hurt interface of stalkers and animals; brutes shrug off half of
 * any knockback, telegraph strikes with a forward lunge, drop vault loot
 * (gem or gold ingot) on the lethal hit, and play the brief shrinking
 * "death pop" before leaving the scene.
 */
import * as THREE from 'three';
import { Block, SOLID } from '../world/blocks';
import { Item } from '../world/items';
import { rayAABB } from '../world/raycast';
import { CHUNK_SIZE } from '../world/chunk';
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

export const GUARDIAN_HALF_WIDTH = 0.42;
export const GUARDIAN_HEIGHT = 1.6;
export const GUARDIAN_HP = 10;
const ATTACK_DAMAGE = 3;
const ATTACK_COOLDOWN_S = 1.2;
const ATTACK_RANGE = 2.0; // long arms: a wider reach than the stalkers'
const MOVE_SPEED = 2.2;
const AGGRO_RANGE = 14; // brutes lurk — they only engage close intruders
const LEASH_RANGE = 16; // beyond this from the vault centre they turn home
const DESPAWN_DIST = 60; // player this far from the vault frees its brutes
const SCAN_INTERVAL_S = 2;
const SCAN_CHUNK_RADIUS = 3; // Chebyshev chunk radius probed via the locator
const NEAR_DIST = 40; // room centres within this of the player get guardians
const PACK_SIZE = 2; // brutes kept alive per haunted dungeon
const SPAWN_SPREAD = 3; // spawn columns sit within ±this of the room centre
const HOP_VELOCITY = 7.2; // climb rubble and steps toward the target
const KNOCKBACK_RESIST = 0.5; // brutes shrug off half the knockback
const LOOT_GEM_CHANCE = 0.6; // lethal-hit loot roll: gem, else gold ingot
/** Melee tell: the torso tips this far forward on a hit, decaying upright. */
const LUNGE_TIP = 0.25;
const LUNGE_S = 0.3; // seconds the lunge tell takes to decay
/** Death pop: a slain brute lingers this long, shrinking, before removal. */
const DYING_S = 0.18;
const DYING_SHRINK = 14; // per-second scale decay while dying
const DYING_MIN_SCALE = 0.05; // the pop never shrinks below this

/** Room centre of a located dungeon, in world block coordinates. */
export interface DungeonSite {
  x: number;
  y: number;
  z: number;
}

/** Chunk-keyed dungeon probe: the buried room centre, or null if none. */
export type DungeonLocator = (cx: number, cz: number) => DungeonSite | null;

export interface Guardian {
  readonly body: Body;
  /** Dungeon tag ("cx,cz") this brute counts against for the live pack. */
  readonly key: string;
  /** Room centre the brute leashes back to. */
  readonly homeX: number;
  readonly homeY: number;
  readonly homeZ: number;
  yaw: number;
  hp: number;
  attackCd: number;
  wanderTimer: number;
  /** Walk-cycle phase driving limb swing. */
  phase: number;
  /** Hurt-flash seconds remaining. */
  flash: number;
  /** Melee-lunge seconds remaining — the torso tips forward, then decays. */
  lunge: number;
  /** Death-pop seconds remaining; > 0 means slain: no AI, shrink, then despawn. */
  dying: number;
  /** Knockback impulse, decaying, added to the drive velocity. */
  kbX: number;
  kbZ: number;
  readonly group: THREE.Group;
  readonly limbs: readonly THREE.Mesh[];
  /** Torso mesh — tips forward for the melee lunge tell. */
  readonly torso: THREE.Mesh;
  readonly mats: readonly THREE.MeshLambertMaterial[];
}

// Eye slits are unlit so they glint in dark vaults; the dim violet matches
// the geode-crystal palette.
const guardianEyeMaterial = new THREE.MeshBasicMaterial({ color: 0x7f68c9 });
const guardianMawMaterial = new THREE.MeshBasicMaterial({ color: 0x17151e });

const LEG_LEN = 0.5;
const ARM_LEN = 0.85;

/**
 * Hulking brute: a wide low torso slung over short thick legs, long heavy
 * arms ending in oversized stone-knuckle fists, and a small head sunk
 * between shoulder slabs with dim violet eye slits. Ashstone-grey hide,
 * darker limbs; every Lambert material is a per-entity clone so the hurt
 * flash never bleeds across brutes.
 */
function makeGuardianMesh(): {
  group: THREE.Group;
  torso: THREE.Mesh;
  limbs: THREE.Mesh[];
  mats: THREE.MeshLambertMaterial[];
} {
  const hideMat = hideMaterial(0x73737b, 'stone'); // ashstone hide
  const limbMat = hideMaterial(0x53545c, 'stone'); // darker limbs
  const fistMat = hideMaterial(0x8b8c92, 'stone'); // stone knuckles
  const group = new THREE.Group();
  group.name = 'entity';

  // Wide, low torso.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.66, 0.5), hideMat);
  torso.name = 'entity';
  torso.position.set(0, LEG_LEN + 0.33, 0);
  group.add(torso);
  group.add(shadowBlob(0.62));

  // Shoulder slabs with a small head sunk in the gap between them.
  for (const sx of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.54), hideMat);
    slab.name = 'entity';
    slab.position.set(sx * 0.36, 1.24, 0);
    group.add(slab);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.3), hideMat);
  head.name = 'entity';
  head.position.set(0, 1.2, -0.06);
  group.add(head);
  // FACE: wider glowing eye slits under one heavy stone brow, and a grim
  // mouth gash — the brute finally has a face to hate.
  for (const ex of [-0.09, 0.09]) {
    const socket = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.11, 0.025), guardianMawMaterial);
    socket.name = 'entity';
    socket.position.set(ex, 1.22, -0.215);
    group.add(socket);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.03), guardianEyeMaterial);
    eye.name = 'entity';
    eye.position.set(ex, 1.22, -0.225);
    group.add(eye);
  }
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.07), limbMat);
  brow.name = 'entity';
  brow.position.set(0, 1.31, -0.21);
  group.add(brow);
  const maw = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.03), guardianMawMaterial);
  maw.name = 'entity';
  maw.position.set(0, 1.09, -0.22);
  group.add(maw);

  // Limbs pivot at hip/shoulder: [legL, legR, armL, armR].
  const limbs: THREE.Mesh[] = [];
  const legGeo = new THREE.BoxGeometry(0.3, LEG_LEN, 0.34);
  legGeo.translate(0, -LEG_LEN / 2, 0); // pivot at the hip
  for (const sx of [-1, 1]) {
    const legMesh = new THREE.Mesh(legGeo, limbMat);
    legMesh.name = 'entity';
    legMesh.position.set(sx * 0.22, LEG_LEN, 0);
    group.add(legMesh);
    limbs.push(legMesh);
  }
  const armGeo = new THREE.BoxGeometry(0.24, ARM_LEN, 0.26);
  armGeo.translate(0, -ARM_LEN / 2, 0); // pivot at the shoulder
  for (const sx of [-1, 1]) {
    const armMesh = new THREE.Mesh(armGeo, limbMat);
    armMesh.name = 'entity';
    armMesh.position.set(sx * 0.58, 1.18, 0);
    group.add(armMesh);
    limbs.push(armMesh);
    // Oversized stone-knuckle fist — a child of the arm, so it swings.
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 0.34), fistMat);
    fist.name = 'entity';
    fist.position.set(0, -ARM_LEN - 0.1, 0);
    armMesh.add(fist);
  }
  return { group, torso, limbs, mats: [hideMat, limbMat, fistMat] };
}

export class GuardianSystem {
  readonly guardians: Guardian[] = [];
  private world: WorldView | null = null;
  private scanTimer = 0;
  private readonly moveResult: MoveResult = { hitX: false, hitY: false, hitZ: false };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly dungeonLocator: DungeonLocator,
    private readonly random: () => number = Math.random,
  ) {}

  setWorld(world: WorldView | null): void {
    this.clear();
    this.world = world;
  }

  clear(): void {
    for (const g of this.guardians) this.scene.remove(g.group);
    this.guardians.length = 0;
    this.scanTimer = 0;
  }

  get count(): number {
    return this.guardians.length;
  }

  spawnAt(x: number, y: number, z: number, key: string, home: DungeonSite): Guardian {
    const parts = makeGuardianMesh();
    const guardian: Guardian = {
      body: createBody(x, y, z),
      key,
      homeX: home.x,
      homeY: home.y,
      homeZ: home.z,
      yaw: this.random() * Math.PI * 2,
      hp: GUARDIAN_HP,
      attackCd: 0,
      wanderTimer: 0,
      phase: 0,
      flash: 0,
      lunge: 0,
      dying: 0,
      kbX: 0,
      kbZ: 0,
      group: parts.group,
      limbs: parts.limbs,
      torso: parts.torso,
      mats: parts.mats,
    };
    this.scene.add(guardian.group);
    this.guardians.push(guardian);
    return guardian;
  }

  /**
   * Place one brute on a solid-with-2-air column within ±SPAWN_SPREAD of the
   * room centre, probing a few floor heights around the centre y. Columns are
   * walked from a random start so a pair spreads out; skips (until the next
   * scan) when no column fits.
   */
  private spawnNear(key: string, home: DungeonSite): void {
    const world = this.world;
    if (!world) return;
    const bx = Math.floor(home.x);
    const by = Math.floor(home.y);
    const bz = Math.floor(home.z);
    const span = SPAWN_SPREAD * 2 + 1;
    const cells = span * span;
    const start = Math.floor(this.random() * cells);
    for (let i = 0; i < cells; i++) {
      const o = (start + i) % cells;
      const x = bx + (o % span) - SPAWN_SPREAD;
      const z = bz + Math.floor(o / span) - SPAWN_SPREAD;
      for (let y = by + 1; y >= by - 3; y--) {
        const id = world.getBlock(x, y, z);
        if (SOLID[id] !== 1) continue;
        if (world.getBlock(x, y + 1, z) === Block.air && world.getBlock(x, y + 2, z) === Block.air) {
          this.spawnAt(x + 0.5, y + 1, z + 0.5, key, home);
          return;
        }
        break; // topmost solid in the band is roofed — try the next column
      }
    }
  }

  /**
   * Probe chunks within Chebyshev SCAN_CHUNK_RADIUS of the player's chunk;
   * every dungeon whose room centre lies within NEAR_DIST of the player keeps
   * PACK_SIZE brutes alive (a simple live-count per dungeon tag — despawn or
   * death frees a slot for the next scan).
   */
  private scan(px: number, py: number, pz: number): void {
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);
    for (let cz = pcz - SCAN_CHUNK_RADIUS; cz <= pcz + SCAN_CHUNK_RADIUS; cz++) {
      for (let cx = pcx - SCAN_CHUNK_RADIUS; cx <= pcx + SCAN_CHUNK_RADIUS; cx++) {
        const home = this.dungeonLocator(cx, cz);
        if (!home) continue;
        const dx = home.x - px;
        const dy = home.y - py;
        const dz = home.z - pz;
        if (dx * dx + dy * dy + dz * dz > NEAR_DIST * NEAR_DIST) continue;
        const key = `${cx},${cz}`;
        let live = 0;
        for (const g of this.guardians) {
          if (g.key === key) live++;
        }
        for (let i = live; i < PACK_SIZE; i++) this.spawnNear(key, home);
      }
    }
  }

  /**
   * Advance all brutes: periodic spawn scans, per-brute AI/physics, and the
   * vault-abandoned despawn. `hitPlayer` applies melee damage.
   */
  fixedUpdate(
    dt: number,
    px: number,
    py: number,
    pz: number,
    hitPlayer: (damage: number) => void,
  ): void {
    const world = this.world;
    if (!world) return;
    this.scanTimer -= dt;
    if (this.scanTimer <= 0) {
      this.scanTimer = SCAN_INTERVAL_S;
      this.scan(px, py, pz);
    }
    for (let i = this.guardians.length - 1; i >= 0; i--) {
      const g = this.guardians[i];
      if (!g) continue;
      if (g.dying > 0) {
        // Death pop: no AI or movement — shrink, then despawn (frees the tag).
        g.dying -= dt;
        if (g.dying <= 0) {
          this.scene.remove(g.group);
          this.guardians.splice(i, 1);
        } else {
          const k = Math.max(DYING_MIN_SCALE, g.group.scale.x * Math.max(0, 1 - dt * DYING_SHRINK));
          g.group.scale.set(k, k, k);
        }
        continue;
      }
      // The slot frees when the player leaves the vault behind (or the brute
      // falls out of the world).
      const hdx = g.homeX - px;
      const hdy = g.homeY - py;
      const hdz = g.homeZ - pz;
      if (hdx * hdx + hdy * hdy + hdz * hdz > DESPAWN_DIST * DESPAWN_DIST || g.body.y < -10) {
        this.scene.remove(g.group);
        this.guardians.splice(i, 1);
        continue;
      }
      this.step(g, world, dt, px, py, pz, hitPlayer);
      g.group.position.set(g.body.x, g.body.y, g.body.z);
      g.group.rotation.set(0, g.yaw, 0);
      this.animate(g, dt);
    }
  }

  /** Ponderous limb swing scaled by speed, the lunge tell, and hurt flash. */
  private animate(g: Guardian, dt: number): void {
    const speed = Math.hypot(g.body.vx, g.body.vz);
    if (speed > 0.2 && g.body.onGround) {
      // Slow gait: low phase rate; the heavy arms drag with a shorter swing.
      g.phase += dt * (1.5 + speed * 1.5);
      const swing = Math.sin(g.phase) * 0.55;
      // Legs [0,1] alternate; arms [2,3] counter-swing their side's leg.
      g.limbs[0]?.rotation.set(swing, 0, 0);
      g.limbs[1]?.rotation.set(-swing, 0, 0);
      g.limbs[2]?.rotation.set(-swing * 0.6, 0, 0);
      g.limbs[3]?.rotation.set(swing * 0.6, 0, 0);
    } else {
      for (const limb of g.limbs) limb.rotation.x *= Math.max(0, 1 - dt * 10);
    }
    if (g.lunge > 0) {
      // Lunge tell: tipped LUNGE_TIP forward on the hit, decaying upright.
      g.lunge -= dt;
      g.torso.rotation.x = Math.max(0, g.lunge) * (LUNGE_TIP / LUNGE_S);
    }
    if (g.flash > 0) {
      g.flash -= dt;
      const on = g.flash > 0;
      for (const m of g.mats) m.emissive.setRGB(on ? 0.55 : 0, 0, 0);
    }
  }

  private step(
    g: Guardian,
    world: WorldView,
    dt: number,
    px: number,
    py: number,
    pz: number,
    hitPlayer: (damage: number) => void,
  ): void {
    const body = g.body;
    if (g.attackCd > 0) g.attackCd -= dt;

    const dx = px - body.x;
    const dz = pz - body.z;
    const distSq = dx * dx + dz * dz;
    const homeDx = g.homeX - body.x;
    const homeDz = g.homeZ - body.z;
    const homeDistSq = homeDx * homeDx + homeDz * homeDz;
    const leashed = homeDistSq > LEASH_RANGE * LEASH_RANGE;
    const aggro = !leashed && distSq < AGGRO_RANGE * AGGRO_RANGE;

    if (leashed) {
      // Past the leash: ignore the player, trudge back toward the vault.
      const horiz = Math.max(0.001, Math.sqrt(homeDistSq));
      g.yaw = Math.atan2(homeDx, homeDz);
      body.vx = (homeDx / horiz) * MOVE_SPEED;
      body.vz = (homeDz / horiz) * MOVE_SPEED;
    } else if (aggro) {
      g.yaw = Math.atan2(dx, dz); // face the intruder
      const horiz = Math.max(0.001, Math.sqrt(distSq));
      body.vx = (dx / horiz) * MOVE_SPEED;
      body.vz = (dz / horiz) * MOVE_SPEED;
    } else {
      // Lurk: a slow idle wander around the vault.
      g.wanderTimer -= dt;
      if (g.wanderTimer <= 0) {
        g.yaw = this.random() * Math.PI * 2;
        g.wanderTimer = 1.5 + this.random() * 3;
      }
      body.vx = -Math.sin(g.yaw) * MOVE_SPEED * 0.5;
      body.vz = -Math.cos(g.yaw) * MOVE_SPEED * 0.5;
    }

    body.vx += g.kbX;
    body.vz += g.kbZ;
    const kbDecay = Math.max(0, 1 - dt * 5);
    g.kbX *= kbDecay;
    g.kbZ *= kbDecay;

    body.vy -= GRAVITY * dt;
    if (body.vy < -TERMINAL_VELOCITY) body.vy = -TERMINAL_VELOCITY;

    moveBody(
      world.isSolid,
      body,
      body.vx * dt,
      body.vy * dt,
      body.vz * dt,
      this.moveResult,
      GUARDIAN_HALF_WIDTH,
      GUARDIAN_HEIGHT,
    );
    if (body.onGround && (this.moveResult.hitX || this.moveResult.hitZ)) {
      body.vy = HOP_VELOCITY; // clamber over rubble toward the target
    }

    // Melee: in reach including vertical, off cooldown, only while aggroed.
    const dyEye = Math.abs(body.y - py);
    if (aggro && g.attackCd <= 0 && distSq < ATTACK_RANGE * ATTACK_RANGE && dyEye < 2) {
      hitPlayer(ATTACK_DAMAGE);
      g.attackCd = ATTACK_COOLDOWN_S;
      g.lunge = LUNGE_S; // visible tell: the torso tips forward, then decays
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
  ): { guardian: Guardian; distance: number } | null {
    let best: Guardian | null = null;
    let bestT = maxDist;
    for (const g of this.guardians) {
      if (g.dying > 0) continue; // corpses mid-pop can't be targeted
      const b = g.body;
      const t = rayAABB(
        ox, oy, oz, dx, dy, dz,
        b.x - GUARDIAN_HALF_WIDTH, b.y, b.z - GUARDIAN_HALF_WIDTH,
        b.x + GUARDIAN_HALF_WIDTH, b.y + GUARDIAN_HEIGHT, b.z + GUARDIAN_HALF_WIDTH,
      );
      if (t !== null && t <= bestT) {
        best = g;
        bestT = t;
      }
    }
    return best ? { guardian: best, distance: bestT } : null;
  }

  /**
   * Strike a brute; the lethal hit returns the vault loot (gem 60% of the
   * time, else a gold ingot, rolled on the injected rng), non-lethal hits
   * return null. (kx, kz) is the attack direction for knockback — brutes
   * resist, taking it at half strength. The slain body then plays a brief
   * shrinking death pop before fixedUpdate removes it, freeing its slot.
   */
  hurt(guardian: Guardian, kx = 0, kz = 0, damage = 2): { id: number; count: number } | null {
    if (guardian.dying > 0) return null; // already slain — no double loot
    guardian.hp -= damage;
    guardian.body.vy = 3; // a heavy flinch — brutes barely leave the floor
    if (guardian.hp <= 0) {
      guardian.dying = DYING_S;
      return this.random() < LOOT_GEM_CHANCE
        ? { id: Item.gem, count: 1 }
        : { id: Item.goldIngot, count: 1 };
    }
    guardian.flash = 0.22;
    guardian.kbX = kx * 6 * KNOCKBACK_RESIST;
    guardian.kbZ = kz * 6 * KNOCKBACK_RESIST;
    return null;
  }
}
