/**
 * Hostile mobs ("stalkers"): dark humanoids that appear at night near the
 * player, chase and strike on contact, and burn away in daylight. They share
 * the entity AABB physics and the ray-pick/hurt interface with animals, so
 * the player fights them with the same left-click. Melee stalkers telegraph
 * their strikes with a forward torso lunge, and slain mobs play a brief
 * shrinking "death pop" before leaving the scene.
 */
import * as THREE from 'three';
import { Block, SOLID } from '../world/blocks';
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
import { hideMaterial } from './skins';
import type { WorldView } from '../player/controller';

export const STALKER_HALF_WIDTH = 0.3;
export const STALKER_HEIGHT = 1.8;
export const STALKER_HP = 6;
export const NIGHT_BRIGHTNESS = 0.34; // spawn below this; sunburn above ~0.6
const DAY_BRIGHTNESS = 0.6;
const MAX_STALKERS = 18;
const SPAWN_INTERVAL_S = 1.4;
const SPAWN_MIN_DIST = 14;
const SPAWN_MAX_DIST = 34;
const DESPAWN_DIST = 70;
const AGGRO_RANGE = 26;
const MOVE_SPEED = 3.1;
const HOP_VELOCITY = 7.4;
const ATTACK_RANGE = 1.6;
const ATTACK_DAMAGE = 2;
const ATTACK_COOLDOWN_S = 1.0;
const SUNBURN_S = 4;

// Elites: rare oversized "walking boss" stalkers that roam day AND night,
// never sunburn, hit harder, soak more, and burst loot on death.
const ELITE_CHANCE = 0.1; // fraction of night spawns upgraded to elite
const ELITE_DAY_INTERVAL_S = 9; // a lone elite prowls even in daylight
export const ELITE_SCALE = 1.7;
export const ELITE_HP = 24;
const ELITE_DAMAGE = 4;
/** Below this y the world counts as "underground": hostiles spawn any hour. */
export const UNDERGROUND_SPAWN_Y = 114; // below the post-Deepening surface, caves are never safe
/** Melee tell: the torso tips this far forward on a hit, decaying upright. */
const LUNGE_TIP = 0.25;
const LUNGE_S = 0.3; // seconds the lunge tell takes to decay
/** Death pop: a slain stalker lingers this long, shrinking, before removal. */
const DYING_S = 0.18;
const DYING_SHRINK = 14; // per-second scale decay while dying
const DYING_MIN_SCALE = 0.05; // the pop never shrinks below this

// Ranged "spitter" variant.
const RANGED_CHANCE = 0.4;
const PREFERRED_RANGE = 9; // spitters hold this distance
const FIRE_RANGE = 18;
const FIRE_COOLDOWN_S = 2.2;
const PROJECTILE_SPEED = 15;
const PROJECTILE_DAMAGE = 2;
const PROJECTILE_LIFE_S = 3;
const PLAYER_HALF_WIDTH = 0.3;
const PLAYER_HEIGHT = 1.8;

/**
 * Loot burst an elite showers on death (pure): a handful of valuables and
 * supplies, with a rare armor find — unmistakably worth the fight.
 */
export function eliteLoot(random: () => number): Array<{ id: number; count: number }> {
  const drops: Array<{ id: number; count: number }> = [
    { id: Item.gem, count: 1 + Math.floor(random() * 3) },
    { id: Item.goldIngot, count: 1 + Math.floor(random() * 3) },
    { id: Item.ingot, count: 2 + Math.floor(random() * 3) },
    { id: Block.torch, count: 3 + Math.floor(random() * 4) },
  ];
  if (random() < 0.25) drops.push({ id: Item.ironVest, count: 1 });
  return drops;
}

export interface Stalker {
  readonly body: Body;
  readonly ranged: boolean;
  /** Oversized roaming mini-boss: day-proof, harder-hitting, loot-bursting. */
  readonly elite: boolean;
  yaw: number;
  hp: number;
  attackCd: number;
  sunTimer: number;
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

interface Projectile {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  trailAt: number;
  readonly mesh: THREE.Mesh;
}

// Venom bolt: a bright core inside a darker translucent shell, spinning in
// flight and shedding a green wake (see onProjectileTrail).
const projectileMaterial = new THREE.MeshBasicMaterial({ color: 0xd6f06a });
const projectileShellMaterial = new THREE.MeshBasicMaterial({ color: 0x4a7a22, transparent: true, opacity: 0.55 });
const projectileGeometry = new THREE.BoxGeometry(0.16, 0.16, 0.16);
const projectileShellGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
const PROJECTILE_TRAIL_S = 0.08;
const PROJECTILE_SPIN = 8;
// Eyes glow via unlit materials — visible in the dark, which is the point.
const stalkerEyeMaterial = new THREE.MeshBasicMaterial({ color: 0xe03535 });
const spitterEyeMaterial = new THREE.MeshBasicMaterial({ color: 0xb8e04a });
// Elites wear an unlit gold brow band — readable at range, day or night.
const eliteBandMaterial = new THREE.MeshBasicMaterial({ color: 0xe6be4a });
// Bone-white fangs shared by every melee stalker's jaw.
const fangMaterial = new THREE.MeshBasicMaterial({ color: 0xe8e2d2 });

const LEG_LEN = 0.72;
const ARM_LEN = 0.66;

/**
 * Humanoid: torso, head, glowing eyes, two hip legs and two shoulder arms.
 * Melee stalkers add shoulder spikes and arm-end claws; spitters add a wide
 * hood/frill behind the head and a venom-lit throat sac.
 */
function makeStalkerMesh(ranged: boolean): {
  group: THREE.Group;
  torso: THREE.Mesh;
  limbs: THREE.Mesh[];
  mats: THREE.MeshLambertMaterial[];
} {
  const torsoMat = hideMaterial(ranged ? 0x2f3a2b : 0x2b2f3a, 'hide');
  const headMat = hideMaterial(ranged ? 0x66a04a : 0x3a4150, 'hide');
  const limbMat = hideMaterial(ranged ? 0x27301f : 0x232733, 'hide');
  const group = new THREE.Group();
  group.name = 'entity';

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.34), torsoMat);
  torso.name = 'entity';
  torso.position.set(0, LEG_LEN + 0.375, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), headMat);
  head.name = 'entity';
  head.position.set(0, 1.62, 0);
  group.add(torso, head);

  // FACE: big glowing eyes under a heavy brow, a dark jaw slab and a mouth
  // gash with teeth — a hostile you can read from across a clearing.
  const faceDark = new THREE.MeshBasicMaterial({ color: 0x14161c });
  for (const ex of [-0.11, 0.11]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.03), ranged ? spitterEyeMaterial : stalkerEyeMaterial);
    eye.name = 'entity';
    eye.position.set(ex, 1.66, -0.22);
    group.add(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.04), faceDark);
    brow.name = 'entity';
    brow.position.set(ex, 1.73, -0.225);
    brow.rotation.z = ex > 0 ? -0.25 : 0.25; // angled scowl
    group.add(brow);
  }
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.04), faceDark);
  jaw.name = 'entity';
  jaw.position.set(0, 1.48, -0.22);
  group.add(jaw);
  for (const tx of [-0.08, 0, 0.08]) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.03), ranged ? spitterEyeMaterial : fangMaterial);
    tooth.name = 'entity';
    tooth.position.set(tx, 1.52, -0.23);
    group.add(tooth);
  }

  if (ranged) {
    // Spitter: a wide hood/frill flaring up behind the head, plus a throat
    // sac lit with the same venom green as the eyes (shared unlit material).
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.46, 0.1), headMat);
    hood.name = 'entity';
    hood.position.set(0, 1.66, 0.24);
    hood.rotation.x = -0.15; // crest leans forward over the crown
    const sac = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.1), spitterEyeMaterial);
    sac.name = 'entity';
    sac.position.set(0, 1.38, -0.16);
    group.add(hood, sac);
  } else {
    // Stalker: spike nubs jutting off the shoulders (claws ride the arms).
    const spikeGeo = new THREE.BoxGeometry(0.09, 0.2, 0.09);
    spikeGeo.translate(0, 0.1, 0); // pivot at the base
    for (const sx of [-1, 1]) {
      const spike = new THREE.Mesh(spikeGeo, limbMat);
      spike.name = 'entity';
      spike.position.set(sx * 0.26, LEG_LEN + 0.7, 0);
      spike.rotation.z = sx * -0.35; // splayed outward
      group.add(spike);
    }
  }

  // Limbs pivot at hip/shoulder: [legL, legR, armL, armR].
  const limbs: THREE.Mesh[] = [];
  const legGeo = new THREE.BoxGeometry(0.22, LEG_LEN, 0.26);
  legGeo.translate(0, -LEG_LEN / 2, 0);
  for (const sx of [-1, 1]) {
    const legMesh = new THREE.Mesh(legGeo, limbMat);
    legMesh.name = 'entity';
    legMesh.position.set(sx * 0.145, LEG_LEN, 0);
    group.add(legMesh);
    limbs.push(legMesh);
  }
  const armGeo = new THREE.BoxGeometry(0.16, ARM_LEN, 0.2);
  armGeo.translate(0, -ARM_LEN / 2, 0);
  for (const sx of [-1, 1]) {
    const armMesh = new THREE.Mesh(armGeo, limbMat);
    armMesh.name = 'entity';
    armMesh.position.set(sx * 0.365, LEG_LEN + 0.7, 0);
    group.add(armMesh);
    limbs.push(armMesh);
  }
  if (!ranged) {
    // Long claw boxes on the arm ends — children of the arms, so they swing.
    const clawGeo = new THREE.BoxGeometry(0.045, 0.24, 0.05);
    clawGeo.translate(0, -0.12, 0); // hangs from the arm end
    for (const arm of [limbs[2], limbs[3]]) {
      for (const cx of [-0.04, 0.04]) {
        const claw = new THREE.Mesh(clawGeo, limbMat);
        claw.name = 'entity';
        claw.position.set(cx, -ARM_LEN, -0.03);
        arm?.add(claw);
      }
    }
  }
  return { group, torso, limbs, mats: [torsoMat, headMat, limbMat] };
}

export class HostileSystem {
  readonly stalkers: Stalker[] = [];
  private readonly projectiles: Projectile[] = [];
  private world: WorldView | null = null;
  private spawnTimer = 0;
  private eliteTimer = ELITE_DAY_INTERVAL_S;
  /** Venom bolts shed a wake here (main routes to the particle pool). */
  onProjectileTrail: ((x: number, y: number, z: number) => void) | null = null;
  /** A slain elite showers this loot burst (main routes to world drops). */
  onEliteLoot: ((x: number, y: number, z: number, drops: ReadonlyArray<{ id: number; count: number }>) => void) | null = null;
  private readonly moveResult: MoveResult = { hitX: false, hitY: false, hitZ: false };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly random: () => number = Math.random,
  ) {}

  setWorld(world: WorldView | null): void {
    this.clear();
    this.world = world;
  }

  clear(): void {
    for (const s of this.stalkers) this.scene.remove(s.group);
    this.stalkers.length = 0;
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles.length = 0;
    this.spawnTimer = 0;
  }

  get count(): number {
    return this.stalkers.length;
  }

  get projectileCount(): number {
    return this.projectiles.length;
  }

  spawnAt(x: number, y: number, z: number, ranged?: boolean, elite = false): Stalker {
    const isRanged = ranged ?? this.random() < RANGED_CHANCE;
    const parts = makeStalkerMesh(isRanged);
    if (elite) {
      parts.group.scale.set(ELITE_SCALE, ELITE_SCALE, ELITE_SCALE);
      // A gold brow band marks the walking boss from across a field.
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.46), eliteBandMaterial);
      band.name = 'entity';
      band.position.set(0, 1.86, 0);
      parts.group.add(band);
    }
    const stalker: Stalker = {
      body: createBody(x, y, z),
      ranged: isRanged,
      elite,
      yaw: this.random() * Math.PI * 2,
      hp: elite ? ELITE_HP : STALKER_HP,
      attackCd: 0,
      sunTimer: 0,
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
    this.scene.add(stalker.group);
    this.stalkers.push(stalker);
    return stalker;
  }

  private trySpawn(px: number, py: number, pz: number, forceElite = false): void {
    const world = this.world;
    if (!world || this.stalkers.length >= MAX_STALKERS) return;
    const angle = this.random() * Math.PI * 2;
    const dist = SPAWN_MIN_DIST + this.random() * (SPAWN_MAX_DIST - SPAWN_MIN_DIST);
    const x = Math.floor(px + Math.cos(angle) * dist);
    const z = Math.floor(pz + Math.sin(angle) * dist);
    const elite = forceElite || this.random() < ELITE_CHANCE;
    // Underground: scan the cave band around the player's depth for a floor;
    // on the surface: classic top-down scan for the first standable column.
    const underground = py < UNDERGROUND_SPAWN_Y;
    const yTop = underground ? Math.min(184, Math.floor(py) + 10) : 184;
    const yBottom = underground ? Math.max(1, Math.floor(py) - 14) : 1;
    for (let y = yTop; y >= yBottom; y--) {
      const id = world.getBlock(x, y, z);
      if (id === Block.air || id === Block.water) continue;
      if (SOLID[id] === 1 && world.getBlock(x, y + 1, z) === Block.air && world.getBlock(x, y + 2, z) === Block.air) {
        this.spawnAt(x + 0.5, y + 1, z + 0.5, undefined, elite);
      }
      return;
    }
  }

  /**
   * Advance all stalkers. `brightness` is the day/night value; below
   * NIGHT_BRIGHTNESS they spawn, above DAY_BRIGHTNESS they burn. `hitPlayer`
   * applies melee damage.
   */
  fixedUpdate(
    dt: number,
    px: number,
    py: number,
    pz: number,
    brightness: number,
    hitPlayer: (damage: number) => void,
  ): void {
    const world = this.world;
    if (!world) return;
    // Night — or anywhere underground — runs the full spawn cadence; broad
    // daylight still prowls a rare elite so the surface is never quite safe.
    if (brightness < NIGHT_BRIGHTNESS || py < UNDERGROUND_SPAWN_Y) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = SPAWN_INTERVAL_S;
        this.trySpawn(px, py, pz);
      }
    } else {
      this.eliteTimer -= dt;
      if (this.eliteTimer <= 0) {
        this.eliteTimer = ELITE_DAY_INTERVAL_S;
        this.trySpawn(px, py, pz, true);
      }
    }
    for (let i = this.stalkers.length - 1; i >= 0; i--) {
      const s = this.stalkers[i];
      if (!s) continue;
      if (s.dying > 0) {
        // Death pop: no AI, movement or burn — shrink, then despawn.
        s.dying -= dt;
        if (s.dying <= 0) {
          this.scene.remove(s.group);
          this.stalkers.splice(i, 1);
        } else {
          const k = Math.max(DYING_MIN_SCALE, s.group.scale.x * Math.max(0, 1 - dt * DYING_SHRINK));
          s.group.scale.set(k, k, k);
        }
        continue;
      }
      const dx = s.body.x - px;
      const dz = s.body.z - pz;
      const distSq = dx * dx + dz * dz;
      // Burn in daylight, despawn when far.
      if (brightness > DAY_BRIGHTNESS) {
        if (!s.elite) s.sunTimer += dt; // elites never burn
      } else {
        s.sunTimer = 0;
      }
      if (s.sunTimer > SUNBURN_S || distSq > DESPAWN_DIST * DESPAWN_DIST || s.body.y < -10) {
        this.scene.remove(s.group);
        this.stalkers.splice(i, 1);
        continue;
      }
      // Visible sunburn: smoulder hotter and hotter until the sun takes them,
      // so the dawn cull reads as burning instead of a silent pop-out.
      if (s.sunTimer > 0 && s.flash <= 0) {
        const burn = Math.min(1, s.sunTimer / SUNBURN_S);
        for (const m of s.mats) m.emissive.setRGB(burn * 0.9, burn * 0.35, 0);
      }
      this.step(s, world, dt, px, py, pz, distSq, hitPlayer);
      s.group.position.set(s.body.x, s.body.y, s.body.z);
      s.group.rotation.set(0, s.yaw, 0);
      this.animate(s, dt);
    }
    this.updateProjectiles(dt, px, py, pz, hitPlayer);
  }

  /** Limb swing scaled by actual speed, the melee lunge tell, and hurt flash. */
  private animate(s: Stalker, dt: number): void {
    const speed = Math.hypot(s.body.vx, s.body.vz);
    if (speed > 0.2 && s.body.onGround) {
      s.phase += dt * (3 + speed * 2.4);
      const swing = Math.sin(s.phase) * 0.75;
      // Legs [0,1] alternate; arms [2,3] counter-swing their side's leg.
      s.limbs[0]?.rotation.set(swing, 0, 0);
      s.limbs[1]?.rotation.set(-swing, 0, 0);
      s.limbs[2]?.rotation.set(-swing, 0, 0);
      s.limbs[3]?.rotation.set(swing, 0, 0);
    } else {
      for (const limb of s.limbs) limb.rotation.x *= Math.max(0, 1 - dt * 10);
    }
    if (s.lunge > 0) {
      // Lunge tell: tipped LUNGE_TIP forward on the hit, decaying upright.
      s.lunge -= dt;
      s.torso.rotation.x = Math.max(0, s.lunge) * (LUNGE_TIP / LUNGE_S);
    }
    if (s.flash > 0) {
      s.flash -= dt;
      const on = s.flash > 0;
      for (const m of s.mats) m.emissive.setRGB(on ? 0.55 : 0, 0, 0);
    }
  }

  private step(
    s: Stalker,
    world: WorldView,
    dt: number,
    px: number,
    py: number,
    pz: number,
    distSq: number,
    hitPlayer: (damage: number) => void,
  ): void {
    const body = s.body;
    if (s.attackCd > 0) s.attackCd -= dt;

    const aggro = distSq < AGGRO_RANGE * AGGRO_RANGE;
    const horiz = Math.max(0.001, Math.hypot(px - body.x, pz - body.z));
    if (aggro && s.ranged) {
      // Spitter: face the player and hold the preferred range — back off when
      // too close, sidle in when too far, otherwise strafe to a near-stop.
      s.yaw = Math.atan2(px - body.x, pz - body.z);
      const dist = Math.sqrt(distSq);
      const toward = (dist - PREFERRED_RANGE) / Math.max(2, PREFERRED_RANGE);
      const drive = Math.max(-1, Math.min(1, toward)) * MOVE_SPEED;
      body.vx = ((px - body.x) / horiz) * drive;
      body.vz = ((pz - body.z) / horiz) * drive;
      if (s.attackCd <= 0 && dist < FIRE_RANGE) {
        this.fire(s, px, py, pz);
        s.attackCd = FIRE_COOLDOWN_S;
      }
    } else if (aggro) {
      s.yaw = Math.atan2(px - body.x, pz - body.z); // face the player
      body.vx = ((px - body.x) / horiz) * MOVE_SPEED;
      body.vz = ((pz - body.z) / horiz) * MOVE_SPEED;
    } else {
      s.wanderTimer -= dt;
      if (s.wanderTimer <= 0) {
        s.yaw = this.random() * Math.PI * 2;
        s.wanderTimer = 1 + this.random() * 3;
      }
      body.vx = -Math.sin(s.yaw) * MOVE_SPEED * 0.5;
      body.vz = -Math.cos(s.yaw) * MOVE_SPEED * 0.5;
    }

    body.vx += s.kbX;
    body.vz += s.kbZ;
    const kbDecay = Math.max(0, 1 - dt * 5);
    s.kbX *= kbDecay;
    s.kbZ *= kbDecay;

    body.vy -= GRAVITY * dt;
    if (body.vy < -TERMINAL_VELOCITY) body.vy = -TERMINAL_VELOCITY;

    moveBody(
      world.isSolid,
      body,
      body.vx * dt,
      body.vy * dt,
      body.vz * dt,
      this.moveResult,
      STALKER_HALF_WIDTH,
      STALKER_HEIGHT,
    );
    if (body.onGround && (this.moveResult.hitX || this.moveResult.hitZ)) {
      body.vy = HOP_VELOCITY; // climb obstacles toward the player
    }

    // Melee (non-ranged only): in range including vertical, off cooldown.
    const dyEye = Math.abs(body.y - py);
    if (!s.ranged && aggro && s.attackCd <= 0 && distSq < ATTACK_RANGE * ATTACK_RANGE && dyEye < 2) {
      hitPlayer(s.elite ? ELITE_DAMAGE : ATTACK_DAMAGE);
      s.attackCd = ATTACK_COOLDOWN_S;
      s.lunge = LUNGE_S; // visible tell: the torso tips forward, then decays
    }
  }

  /** Launch a projectile from the spitter's head toward the player's chest. */
  private fire(s: Stalker, px: number, py: number, pz: number): void {
    const ox = s.body.x;
    const oy = s.body.y + STALKER_HEIGHT * 0.85;
    const oz = s.body.z;
    const tx = px;
    const ty = py + 1.0; // aim at the torso
    const tz = pz;
    const len = Math.max(0.001, Math.hypot(tx - ox, ty - oy, tz - oz));
    const mesh = new THREE.Mesh(projectileGeometry, projectileMaterial);
    mesh.name = 'entity';
    const shell = new THREE.Mesh(projectileShellGeometry, projectileShellMaterial);
    shell.name = 'entity';
    mesh.add(shell);
    mesh.position.set(ox, oy, oz);
    this.scene.add(mesh);
    this.projectiles.push({
      x: ox,
      y: oy,
      z: oz,
      vx: ((tx - ox) / len) * PROJECTILE_SPEED,
      vy: ((ty - oy) / len) * PROJECTILE_SPEED,
      vz: ((tz - oz) / len) * PROJECTILE_SPEED,
      life: PROJECTILE_LIFE_S,
      trailAt: PROJECTILE_TRAIL_S,
      mesh,
    });
  }

  /** Integrate projectiles; despawn on terrain or expiry, damage on player hit. */
  private updateProjectiles(
    dt: number,
    px: number,
    py: number,
    pz: number,
    hitPlayer: (damage: number) => void,
  ): void {
    const world = this.world;
    if (!world) return;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!p) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.life -= dt;
      let dead = p.life <= 0;
      // Terrain collision.
      if (!dead && SOLID[world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))] === 1) {
        dead = true;
      }
      // Player AABB hit.
      if (
        !dead &&
        p.x > px - PLAYER_HALF_WIDTH &&
        p.x < px + PLAYER_HALF_WIDTH &&
        p.z > pz - PLAYER_HALF_WIDTH &&
        p.z < pz + PLAYER_HALF_WIDTH &&
        p.y > py &&
        p.y < py + PLAYER_HEIGHT
      ) {
        hitPlayer(PROJECTILE_DAMAGE);
        dead = true;
      }
      if (dead) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      } else {
        p.mesh.position.set(p.x, p.y, p.z);
        p.mesh.rotation.x += PROJECTILE_SPIN * dt;
        p.mesh.rotation.y += PROJECTILE_SPIN * 0.7 * dt;
        p.trailAt -= dt;
        if (this.onProjectileTrail && p.trailAt <= 0) {
          p.trailAt = PROJECTILE_TRAIL_S;
          this.onProjectileTrail(p.x, p.y, p.z);
        }
      }
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
  ): { stalker: Stalker; distance: number } | null {
    let best: Stalker | null = null;
    let bestT = maxDist;
    for (const s of this.stalkers) {
      if (s.dying > 0) continue; // corpses mid-pop can't be targeted
      const b = s.body;
      // Elites are visually 1.7x: the hitbox matches what you see.
      const hw = s.elite ? STALKER_HALF_WIDTH * ELITE_SCALE : STALKER_HALF_WIDTH;
      const hh = s.elite ? STALKER_HEIGHT * ELITE_SCALE : STALKER_HEIGHT;
      const t = rayAABB(
        ox, oy, oz, dx, dy, dz,
        b.x - hw, b.y, b.z - hw,
        b.x + hw, b.y + hh, b.z + hw,
      );
      if (t !== null && t <= bestT) {
        best = s;
        bestT = t;
      }
    }
    return best ? { stalker: best, distance: bestT } : null;
  }

  /**
   * Strike a stalker; returns true if it died. (kx, kz) is the attack
   * direction for knockback (defaults keep old callers working). The lethal
   * hit reports the kill immediately; the body then plays a brief shrinking
   * death pop before fixedUpdate removes it from scene and array.
   */
  hurt(stalker: Stalker, kx = 0, kz = 0, damage = 2): boolean {
    if (stalker.dying > 0) return false; // already slain and popping
    stalker.hp -= damage;
    stalker.body.vy = 4; // knock-up
    if (stalker.hp <= 0) {
      stalker.dying = DYING_S;
      if (stalker.elite) {
        // Walking-boss reward: shower a loot burst where it fell.
        const b = stalker.body;
        this.onEliteLoot?.(b.x, b.y + 1, b.z, eliteLoot(this.random));
      }
      return true;
    }
    stalker.flash = 0.22;
    stalker.kbX = kx * (stalker.elite ? 2 : 6); // elites barely budge
    stalker.kbZ = kz * (stalker.elite ? 2 : 6);
    return false;
  }
}
