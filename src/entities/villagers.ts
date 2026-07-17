/**
 * Village wardens ("villagers"): friendly hooded folk who keep to their
 * settlement. Physics reuses the AABB sweep with entity dimensions; rendering
 * is a per-warden rig of Lambert boxes — dyed tunic, hood, apron on some —
 * with hip/shoulder-pivoted limbs. Not persisted: each village (located by
 * `villageCenterFor`) re-fills toward its hash-rolled population of 3-5 while
 * the player is near, and every warden is tagged with its village key and a
 * stable index inside it, so the barter book (`offersFor`) survives respawns.
 * Wardens are leashed to the village centre — a wide roam by day, a tight
 * huddle around the well and lamps by night — and they cannot be hunted:
 * striking one merely startles it into a brief fleeing sprint.
 */
import * as THREE from 'three';
import { Block } from '../world/blocks';
import { CHUNK_HEIGHT, CHUNK_SIZE } from '../world/chunk';
import { hash2 } from '../world/noise';
import { rayAABB } from '../world/raycast';
import { villageCenterFor, VILLAGE_REGION } from '../world/worldgen';
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

export const VILLAGER_HALF_WIDTH = 0.3;
export const VILLAGER_HEIGHT = 1.7;
/** Day leash: beyond this many blocks from the village centre they turn home. */
export const LEASH_DIST = 24;
/** Night leash: after dark the wardens huddle this close to the centre. */
export const NIGHT_LEASH_DIST = 10;
const SPAWN_INTERVAL_S = 2; // one re-population sweep every ~2 s
const VILLAGE_ACTIVE_DIST = 80; // villages with a centre this close to the player re-fill
const DEEP_POPULATION = 2; // underfolk traders living in each deephold hall
const DEEP_ACTIVE_DIST = 48; // deepholds this close (2D) to the player re-fill
const DESPAWN_DIST = 110;
const SPAWN_SCATTER = 6; // spawn columns land within ±6 blocks of the centre
const WALK_SPEED = 1.2;
const NIGHT_SPEED = 0.5; // after-dark shuffle
const FLEE_SPEED = 2.4; // startled sprint
const FLEE_S = 2; // seconds a startle keeps them running
const HOP_VELOCITY = 7.4;
const KNOCKBACK = 7;
const STARTLE_HOP = 4; // small flinch jump on a startle
const STARTLE_FLASH_S = 0.18; // warm emissive blink acknowledging the hit
const IDLE_BOB_RATE = Math.PI * 1.6; // idle phase advance (rad/s) — ~0.8 Hz
const IDLE_BOB_TILT = 0.06; // idle head tilt amplitude (radians)
const IDLE_ARM_SWAY = 0.05; // idle arm swing amplitude (radians)
const IDLE_ARM_SPLAY = 0.04; // resting arms sit slightly away from the tunic

// Rig proportions (collision stays VILLAGER_HALF_WIDTH × VILLAGER_HEIGHT).
const LEG_LEN = 0.66;
const ARM_LEN = 0.58;
const TORSO_W = 0.5;
const TORSO_H = 0.62;
const TORSO_D = 0.3;
const HEAD_S = 0.4;

/** Warm dyed-wool tunic palette: madder, ochre, rust, mulberry, olive. */
export const TUNIC_PALETTE: readonly number[] = [0xa8433a, 0xc9973b, 0xb96a33, 0x8a4a62, 0x7c6a35];
const SKIN_COLOR = 0xd9a877;
const TROUSER_COLOR = 0x6b543b; // undyed workaday linen
const APRON_COLOR = 0xded2bd;

/** Shared face materials/geometry — friendly, readable, never glowing. */
const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x2a2620 });
const eyeWhiteMaterial = new THREE.MeshBasicMaterial({ color: 0xf2efe6 });
// FACES v2: bigger, higher-contrast features that read at trade distance.
const eyeWhiteGeometry = new THREE.BoxGeometry(0.14, 0.12, 0.03);
const pupilGeometry = new THREE.BoxGeometry(0.065, 0.07, 0.025);
const noseGeometry = new THREE.BoxGeometry(0.08, 0.11, 0.06);
const mouthGeometry = new THREE.BoxGeometry(0.16, 0.035, 0.02);

/** Pack a village region (rx, rz) into one int key (exact for |r| < 32768). */
export function packVillageKey(rx: number, rz: number): number {
  return ((rx & 0xffff) << 16) | (rz & 0xffff);
}

/**
 * Packed key for a deephold's traders (chunk coords, salted so it can never
 * be confused with a surface village's region key).
 */
export function packDeepholdKey(cx: number, cz: number): number {
  return (((cx & 0xffff) << 16) | (cz & 0xffff)) ^ 0x2f177e39;
}

/** Target head-count (3-5) for the village of region (rx, rz), from its hash. */
export function populationFor(seedInt: number, rx: number, rz: number): number {
  return 3 + ((hash2(seedInt, rx, rz) >>> 6) % 3);
}

export interface Villager {
  readonly body: Body;
  /** Packed home-region key (see packVillageKey) — pairs with `index`. */
  readonly villageKey: number;
  /** Stable slot 0..population-1 inside the village; keys the barter book. */
  readonly index: number;
  /** Village-centre block this warden is leashed to. */
  readonly homeX: number;
  readonly homeZ: number;
  yaw: number;
  moving: boolean;
  /** Seconds until the next wander decision. */
  timer: number;
  /** Walk-cycle phase driving the limb swing (creeps on while idle). */
  phase: number;
  /** Flee-sprint seconds remaining after a startle. */
  flee: number;
  /** Startle-flash seconds remaining (materials blink warm while > 0). */
  flash: number;
  /** Knockback impulse, decaying, added to the walk velocity. */
  kbX: number;
  kbZ: number;
  readonly group: THREE.Group;
  /** Hip-pivoted legs [left, right] — alternate while walking. */
  readonly legs: readonly THREE.Mesh[];
  /** Shoulder-pivoted arms [left, right] — counter-swing, sway at rest. */
  readonly arms: readonly THREE.Mesh[];
  readonly torso: THREE.Mesh;
  /** Head mesh — hood, brim and eyes ride along with the idle bob. */
  readonly head: THREE.Mesh;
  /** Per-warden material clones, so a startle flash never tints the village. */
  readonly mats: readonly THREE.MeshLambertMaterial[];
}

/**
 * Friendly humanoid rig: dyed tunic torso with a belt sash (and an apron on
 * some), a skin-toned head under a slightly larger hood box wrapped behind
 * and above the crown, small dark eyes, and two legs plus two arms pivoted
 * at hip and shoulder with skin-toned hands riding the sleeve ends.
 */
function makeVillagerMesh(tunicColor: number, apron: boolean): {
  group: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Mesh;
  legs: THREE.Mesh[];
  arms: THREE.Mesh[];
  mats: THREE.MeshLambertMaterial[];
} {
  const mats: THREE.MeshLambertMaterial[] = [];
  /** Per-warden cloth-textured Lambert clone, registered for the startle flash. */
  const mat = (color: THREE.Color | number): THREE.MeshLambertMaterial => {
    const m = hideMaterial(color, 'cloth');
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
  const tunic = mat(tunicColor);
  // The hood and belt are the same cloth, dipped in a deeper vat of the dye.
  const hoodCloth = mat(new THREE.Color(tunicColor).multiplyScalar(0.62));
  const skin = mat(SKIN_COLOR);
  const trousers = mat(TROUSER_COLOR);
  const group = new THREE.Group();
  group.name = 'entity';

  const torso = new THREE.Mesh(new THREE.BoxGeometry(TORSO_W, TORSO_H, TORSO_D), tunic);
  torso.name = 'entity';
  torso.position.set(0, LEG_LEN + TORSO_H / 2, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(HEAD_S, HEAD_S, HEAD_S), skin);
  head.name = 'entity';
  head.position.set(0, LEG_LEN + TORSO_H + HEAD_S / 2, 0);
  group.add(torso, head);

  // Hood: a slightly larger box behind the head, plus a brim over the crown.
  const hood = detail(new THREE.BoxGeometry(HEAD_S + 0.08, HEAD_S + 0.04, 0.2), hoodCloth, head);
  hood.position.set(0, 0.05, 0.13);
  const brim = detail(new THREE.BoxGeometry(HEAD_S + 0.08, 0.1, HEAD_S + 0.1), hoodCloth, head);
  brim.position.set(0, HEAD_S / 2 + 0.01, 0.03);

  // FACE: two-layer eyes, a skin-toned nose and a gentle mouth line — the
  // wardens look like people now. All children of the head for idle tilts.
  for (const ex of [-0.1, 0.1]) {
    const white = detail(eyeWhiteGeometry, eyeWhiteMaterial, head);
    white.position.set(ex, 0.04, -HEAD_S / 2 - 0.012);
    const pupil = detail(pupilGeometry, eyeMaterial, head);
    pupil.position.set(ex - Math.sign(ex) * 0.01, 0.035, -HEAD_S / 2 - 0.026);
  }
  const nose = detail(noseGeometry, skin, head);
  nose.position.set(0, -0.04, -HEAD_S / 2 - 0.02);
  const mouth = detail(mouthGeometry, eyeMaterial, head);
  mouth.position.set(0, -0.13, -HEAD_S / 2 - 0.012);

  // Belt sash around the tunic; an apron front panel on some wardens.
  const belt = detail(new THREE.BoxGeometry(TORSO_W + 0.04, 0.09, TORSO_D + 0.04), hoodCloth, torso);
  belt.position.set(0, -0.08, 0);
  if (apron) {
    const panel = detail(new THREE.BoxGeometry(0.34, 0.46, 0.05), mat(APRON_COLOR), torso);
    panel.position.set(0, -0.07, -TORSO_D / 2 - 0.03);
  }

  // Limbs pivot at hip/shoulder; geometry shifted so rotation swings the end.
  const legs: THREE.Mesh[] = [];
  const legGeo = new THREE.BoxGeometry(0.2, LEG_LEN, 0.24);
  legGeo.translate(0, -LEG_LEN / 2, 0);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, trousers);
    leg.name = 'entity';
    leg.position.set(sx * 0.13, LEG_LEN, 0);
    group.add(leg);
    legs.push(leg);
  }
  const arms: THREE.Mesh[] = [];
  const armGeo = new THREE.BoxGeometry(0.16, ARM_LEN, 0.18);
  armGeo.translate(0, -ARM_LEN / 2, 0);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, tunic);
    arm.name = 'entity';
    arm.position.set(sx * (TORSO_W / 2 + 0.08), LEG_LEN + TORSO_H - 0.05, 0);
    group.add(arm);
    arms.push(arm);
    // A bare hand at the sleeve end — a child, so it rides the swing.
    detail(new THREE.BoxGeometry(0.14, 0.1, 0.16), skin, arm).position.set(0, -ARM_LEN + 0.04, 0);
  }
  return { group, torso, head, legs, arms, mats };
}

export class VillagerSystem {
  readonly villagers: Villager[] = [];
  private world: WorldView | null = null;
  private deepholdFn: ((cx: number, cz: number) => { x: number; y: number; z: number } | null) | null = null;
  private night = false;
  private spawnEnabled = true;
  private spawnTimer = 0;
  private readonly moveResult: MoveResult = { hitX: false, hitY: false, hitZ: false };

  constructor(
    private readonly scene: THREE.Scene,
    /** World village seed — cyrb128(`${seed} villages`)[0], as worldgen uses. */
    private readonly seedInt: number,
    private readonly random: () => number = Math.random,
  ) {}

  /** Bind to a world (session start) — clears any previous population. */
  setWorld(world: WorldView | null): void {
    this.clear();
    this.world = world;
  }

  /** Day/night: at night the wardens slow down and huddle near the centre. */
  setNight(night: boolean): void {
    this.night = night;
  }

  get isNight(): boolean {
    return this.night;
  }

  /** Pause/resume village re-population (existing wardens keep updating). */
  setSpawning(enabled: boolean): void {
    this.spawnEnabled = enabled;
  }

  clear(): void {
    for (const v of this.villagers) this.scene.remove(v.group);
    this.villagers.length = 0;
    this.spawnTimer = 0;
  }

  get count(): number {
    return this.villagers.length;
  }

  /**
   * Place a warden directly (also the test seam). Looks are deterministic per
   * (seed, villageKey, index): the tunic dye comes from the warm palette and
   * some wardens wear an apron, so a village's cast is stable across visits.
   */
  spawnAt(
    x: number,
    y: number,
    z: number,
    villageKey = 0,
    index = 0,
    homeX = x,
    homeZ = z,
  ): Villager {
    const look = hash2(this.seedInt, villageKey, index);
    const tunic = TUNIC_PALETTE[look % TUNIC_PALETTE.length] ?? 0xa8433a;
    const apron = (look >>> 4) % 10 < 4;
    const parts = makeVillagerMesh(tunic, apron);
    const villager: Villager = {
      body: createBody(x, y, z),
      villageKey,
      index,
      homeX,
      homeZ,
      yaw: this.random() * Math.PI * 2,
      moving: false,
      timer: 0.5 + this.random() * 2,
      phase: 0,
      flee: 0,
      flash: 0,
      kbX: 0,
      kbZ: 0,
      group: parts.group,
      legs: parts.legs,
      arms: parts.arms,
      torso: parts.torso,
      head: parts.head,
      mats: parts.mats,
    };
    this.scene.add(villager.group);
    this.villagers.push(villager);
    return villager;
  }

  /**
   * Top-down scan of column (x, z): the y a warden would stand at — one above
   * the topmost solid block, needing two clear cells of headroom — or null
   * when the column is empty, submerged or roofed too tightly.
   */
  private surfaceY(world: WorldView, x: number, z: number): number | null {
    for (let y = CHUNK_HEIGHT - 8; y >= 1; y--) {
      if (!world.isSolid(x, y, z)) continue;
      return world.getBlock(x, y + 1, z) === Block.air && world.getBlock(x, y + 2, z) === Block.air
        ? y + 1
        : null;
    }
    return null;
  }

  /** Lowest index 0..population-1 not held by a live warden, or null if full. */
  private freeIndex(key: number, population: number): number | null {
    for (let i = 0; i < population; i++) {
      let held = false;
      for (const v of this.villagers) {
        if (v.villageKey === key && v.index === i) {
          held = true;
          break;
        }
      }
      if (!held) return i;
    }
    return null;
  }

  /**
   * Re-population sweep: check the player's village region and its 8
   * neighbours; every region hosting a village whose centre is within
   * VILLAGE_ACTIVE_DIST of the player fills back toward its rolled
   * population, one warden per sweep, dropped onto a walkable column within
   * ±SPAWN_SCATTER blocks of the centre-chunk middle. The new warden takes
   * the lowest free index, so a lost warden's replacement inherits its
   * barter book.
   */
  private trySpawn(px: number, pz: number): void {
    const world = this.world;
    if (!world) return;
    const prx = Math.floor(Math.floor(px / CHUNK_SIZE) / VILLAGE_REGION);
    const prz = Math.floor(Math.floor(pz / CHUNK_SIZE) / VILLAGE_REGION);
    for (let drx = -1; drx <= 1; drx++) {
      for (let drz = -1; drz <= 1; drz++) {
        const rx = prx + drx;
        const rz = prz + drz;
        const centre = villageCenterFor(this.seedInt, rx, rz);
        if (centre === null) continue;
        const hx = centre.cx * CHUNK_SIZE + (CHUNK_SIZE >> 1);
        const hz = centre.cz * CHUNK_SIZE + (CHUNK_SIZE >> 1);
        const dx = hx - px;
        const dz = hz - pz;
        if (dx * dx + dz * dz > VILLAGE_ACTIVE_DIST * VILLAGE_ACTIVE_DIST) continue;
        const key = packVillageKey(rx, rz);
        const index = this.freeIndex(key, populationFor(this.seedInt, rx, rz));
        if (index === null) continue; // fully populated
        const x = hx + Math.floor(this.random() * (SPAWN_SCATTER * 2 + 1)) - SPAWN_SCATTER;
        const z = hz + Math.floor(this.random() * (SPAWN_SCATTER * 2 + 1)) - SPAWN_SCATTER;
        const y = this.surfaceY(world, x, z);
        if (y === null) continue; // e.g. a well shaft or hut interior column
        this.spawnAt(x + 0.5, y, z + 0.5, key, index, hx + 0.5, hz + 0.5);
      }
    }
  }

  /**
   * Underfolk sweep: deepholds near the player (2D — they wait in their
   * halls below) fill toward DEEP_POPULATION traders, stood beside the
   * long-table on the hall's mossstone floor. Same barter-book contract as
   * surface wardens: identical (key, index) → identical offers, forever.
   */
  private tryDeepSpawn(px: number, pz: number): void {
    const world = this.world;
    if (!world || !this.deepholdFn) return;
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);
    for (let dcx = -2; dcx <= 2; dcx++) {
      for (let dcz = -2; dcz <= 2; dcz++) {
        const cx = pcx + dcx;
        const cz = pcz + dcz;
        const at = this.deepholdFn(cx, cz);
        if (!at) continue;
        const dx = at.x - px;
        const dz = at.z - pz;
        if (dx * dx + dz * dz > DEEP_ACTIVE_DIST * DEEP_ACTIVE_DIST) continue;
        const key = packDeepholdKey(cx, cz);
        const index = this.freeIndex(key, DEEP_POPULATION);
        if (index === null) continue; // hall fully peopled
        // Flank the long-table; bail if the hall didn't carve (thin cover).
        const x = at.x + (index === 0 ? -2 : 2);
        const z = at.z + (index === 0 ? 1 : -1);
        if (!world.isSolid(x, at.y - 1, z)) continue;
        if (world.getBlock(x, at.y, z) !== Block.air || world.getBlock(x, at.y + 1, z) !== Block.air) continue;
        this.spawnAt(x + 0.5, at.y, z + 0.5, key, index, at.x + 0.5, at.z + 0.5);
      }
    }
  }

  /** Bind the deephold locator (null outside the overworld). */
  setDeepholdFn(fn: ((cx: number, cz: number) => { x: number; y: number; z: number } | null) | null): void {
    this.deepholdFn = fn;
  }

  fixedUpdate(dt: number, px: number, py: number, pz: number): void {
    const world = this.world;
    if (!world) return;
    if (this.spawnEnabled) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = SPAWN_INTERVAL_S;
        this.trySpawn(px, pz);
        this.tryDeepSpawn(px, pz);
      }
    }
    for (let i = this.villagers.length - 1; i >= 0; i--) {
      const v = this.villagers[i];
      if (!v) continue;
      const body = v.body;
      const dx = body.x - px;
      const dz = body.z - pz;
      if (dx * dx + dz * dz > DESPAWN_DIST * DESPAWN_DIST || body.y < -10) {
        this.scene.remove(v.group);
        this.villagers.splice(i, 1);
        continue;
      }
      this.step(v, world, dt);
      v.group.position.set(body.x, body.y, body.z);
      v.group.rotation.set(0, v.yaw, 0);
      this.animate(v, dt);
    }
    void py;
  }

  /** Limb swing scaled by actual pace, idle arm sway + head bob, startle flash. */
  private animate(v: Villager, dt: number): void {
    const settle = Math.max(0, 1 - dt * 10);
    const speed = Math.hypot(v.body.vx, v.body.vz);
    if (speed > 0.2 && v.body.onGround) {
      v.phase += dt * (3 + speed * 2.4);
      const swing = Math.sin(v.phase) * 0.65;
      // Legs alternate; arms counter-swing their side's leg, sleeves squared.
      v.legs[0]?.rotation.set(swing, 0, 0);
      v.legs[1]?.rotation.set(-swing, 0, 0);
      v.arms[0]?.rotation.set(-swing * 0.8, 0, 0);
      v.arms[1]?.rotation.set(swing * 0.8, 0, 0);
      v.head.rotation.x *= settle;
    } else {
      // Idle life: legs settle, arms sway gently off the hips, head bobs.
      for (const leg of v.legs) leg.rotation.x *= settle;
      v.phase += dt * IDLE_BOB_RATE;
      const sway = Math.sin(v.phase) * IDLE_ARM_SWAY;
      v.arms[0]?.rotation.set(sway, 0, IDLE_ARM_SPLAY);
      v.arms[1]?.rotation.set(-sway, 0, -IDLE_ARM_SPLAY);
      v.head.rotation.x = Math.sin(v.phase) * IDLE_BOB_TILT;
    }
    if (v.flash > 0) {
      v.flash -= dt;
      const on = v.flash > 0;
      // Warm amber blink — acknowledgement, not damage (wardens have no hp).
      for (const m of v.mats) m.emissive.setRGB(on ? 0.35 : 0, on ? 0.24 : 0, on ? 0.06 : 0);
    }
  }

  private step(v: Villager, world: WorldView, dt: number): void {
    const body = v.body;
    if (v.flee > 0) {
      // Startled: hold the flee heading at a sprint; the leash waits its turn.
      v.flee -= dt;
      v.moving = true;
    } else {
      v.timer -= dt;
      if (v.timer <= 0) {
        v.moving = this.random() < 0.6;
        v.yaw = this.random() * Math.PI * 2;
        v.timer = 1 + this.random() * 3;
      }
      // The leash overrides wandering every tick: a wide roam by day, a
      // tight huddle around the well and lamps after dark.
      const leash = this.night ? NIGHT_LEASH_DIST : LEASH_DIST;
      const hx = v.homeX - body.x;
      const hz = v.homeZ - body.z;
      if (hx * hx + hz * hz > leash * leash) {
        v.yaw = Math.atan2(-hx, -hz); // face home (velocity is -sin/-cos)
        v.moving = true;
        if (v.timer < 0.5) v.timer = 0.5; // commit to the homeward heading
      }
    }
    const pace = v.flee > 0 ? FLEE_SPEED : this.night ? NIGHT_SPEED : WALK_SPEED;
    const speed = v.moving ? pace : 0;
    body.vx = -Math.sin(v.yaw) * speed + v.kbX;
    body.vz = -Math.cos(v.yaw) * speed + v.kbZ;
    const kbDecay = Math.max(0, 1 - dt * 5);
    v.kbX *= kbDecay;
    v.kbZ *= kbDecay;
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
      VILLAGER_HALF_WIDTH,
      VILLAGER_HEIGHT,
    );
    // Hop over single-block obstacles when walking into them.
    if (v.moving && body.onGround && (this.moveResult.hitX || this.moveResult.hitZ)) {
      body.vy = HOP_VELOCITY;
    }
  }

  /** Nearest warden hit by the ray within maxDist, or null. */
  raycastNearest(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDist: number,
  ): { villager: Villager; distance: number } | null {
    let best: Villager | null = null;
    let bestT = maxDist;
    for (const v of this.villagers) {
      const b = v.body;
      const t = rayAABB(
        ox, oy, oz, dx, dy, dz,
        b.x - VILLAGER_HALF_WIDTH, b.y, b.z - VILLAGER_HALF_WIDTH,
        b.x + VILLAGER_HALF_WIDTH, b.y + VILLAGER_HEIGHT, b.z + VILLAGER_HALF_WIDTH,
      );
      if (t !== null && t <= bestT) {
        best = v;
        bestT = t;
      }
    }
    return best ? { villager: best, distance: bestT } : null;
  }

  /**
   * Startle a warden — wardens are not prey, so this is the whole "combat"
   * surface: no hp, no drops, no death. (kx, kz) is the attack direction;
   * the warden takes a knockback shove, a flinch hop and a warm flash, then
   * bolts along that direction (away from the attacker) for FLEE_S seconds
   * at FLEE_SPEED before the leash walks it back home.
   */
  startle(villager: Villager, kx = 0, kz = 0): void {
    villager.kbX = kx * KNOCKBACK;
    villager.kbZ = kz * KNOCKBACK;
    villager.body.vy = STARTLE_HOP;
    villager.flee = FLEE_S;
    villager.flash = STARTLE_FLASH_S;
    villager.moving = true;
    // Face directly away from the blow (velocity runs along -sin/-cos of yaw).
    if (kx !== 0 || kz !== 0) villager.yaw = Math.atan2(-kx, -kz);
  }
}
