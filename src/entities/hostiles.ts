/**
 * Hostile mobs ("stalkers"): dark humanoids that appear at night near the
 * player, chase and strike on contact, and burn away in daylight. They share
 * the entity AABB physics and the ray-pick/hurt interface with animals, so
 * the player fights them with the same left-click.
 */
import * as THREE from 'three';
import { Block, SOLID } from '../world/blocks';
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

export const STALKER_HALF_WIDTH = 0.3;
export const STALKER_HEIGHT = 1.8;
export const STALKER_HP = 6;
export const NIGHT_BRIGHTNESS = 0.34; // spawn below this; sunburn above ~0.6
const DAY_BRIGHTNESS = 0.6;
const MAX_STALKERS = 8;
const SPAWN_INTERVAL_S = 3;
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

export interface Stalker {
  readonly body: Body;
  readonly ranged: boolean;
  yaw: number;
  hp: number;
  attackCd: number;
  sunTimer: number;
  wanderTimer: number;
  /** Walk-cycle phase driving limb swing. */
  phase: number;
  /** Hurt-flash seconds remaining. */
  flash: number;
  /** Knockback impulse, decaying, added to the drive velocity. */
  kbX: number;
  kbZ: number;
  readonly group: THREE.Group;
  readonly limbs: readonly THREE.Mesh[];
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
  readonly mesh: THREE.Mesh;
}

const projectileMaterial = new THREE.MeshBasicMaterial({ color: 0x9bd24a });
const projectileGeometry = new THREE.BoxGeometry(0.25, 0.25, 0.25);
// Eyes glow via unlit materials — visible in the dark, which is the point.
const stalkerEyeMaterial = new THREE.MeshBasicMaterial({ color: 0xe03535 });
const spitterEyeMaterial = new THREE.MeshBasicMaterial({ color: 0xb8e04a });

const LEG_LEN = 0.72;
const ARM_LEN = 0.66;

/** Humanoid: torso, head, glowing eyes, two hip legs and two shoulder arms. */
function makeStalkerMesh(ranged: boolean): {
  group: THREE.Group;
  limbs: THREE.Mesh[];
  mats: THREE.MeshLambertMaterial[];
} {
  const torsoMat = new THREE.MeshLambertMaterial({ color: ranged ? 0x2f3a2b : 0x2b2f3a });
  const headMat = new THREE.MeshLambertMaterial({ color: ranged ? 0x66a04a : 0x3a4150 });
  const limbMat = new THREE.MeshLambertMaterial({ color: ranged ? 0x27301f : 0x232733 });
  const group = new THREE.Group();
  group.name = 'entity';

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.34), torsoMat);
  torso.name = 'entity';
  torso.position.set(0, LEG_LEN + 0.375, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), headMat);
  head.name = 'entity';
  head.position.set(0, 1.62, 0);
  group.add(torso, head);

  for (const ex of [-0.1, 0.1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.03), ranged ? spitterEyeMaterial : stalkerEyeMaterial);
    eye.name = 'entity';
    eye.position.set(ex, 1.66, -0.22);
    group.add(eye);
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
  return { group, limbs, mats: [torsoMat, headMat, limbMat] };
}

export class HostileSystem {
  readonly stalkers: Stalker[] = [];
  private readonly projectiles: Projectile[] = [];
  private world: WorldView | null = null;
  private spawnTimer = 0;
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

  spawnAt(x: number, y: number, z: number, ranged?: boolean): Stalker {
    const isRanged = ranged ?? this.random() < RANGED_CHANCE;
    const parts = makeStalkerMesh(isRanged);
    const stalker: Stalker = {
      body: createBody(x, y, z),
      ranged: isRanged,
      yaw: this.random() * Math.PI * 2,
      hp: STALKER_HP,
      attackCd: 0,
      sunTimer: 0,
      wanderTimer: 0,
      phase: 0,
      flash: 0,
      kbX: 0,
      kbZ: 0,
      group: parts.group,
      limbs: parts.limbs,
      mats: parts.mats,
    };
    this.scene.add(stalker.group);
    this.stalkers.push(stalker);
    return stalker;
  }

  private trySpawn(px: number, pz: number): void {
    const world = this.world;
    if (!world || this.stalkers.length >= MAX_STALKERS) return;
    const angle = this.random() * Math.PI * 2;
    const dist = SPAWN_MIN_DIST + this.random() * (SPAWN_MAX_DIST - SPAWN_MIN_DIST);
    const x = Math.floor(px + Math.cos(angle) * dist);
    const z = Math.floor(pz + Math.sin(angle) * dist);
    for (let y = 120; y >= 1; y--) {
      const id = world.getBlock(x, y, z);
      if (id === Block.air || id === Block.water) continue;
      if (SOLID[id] === 1 && world.getBlock(x, y + 1, z) === Block.air) {
        this.spawnAt(x + 0.5, y + 1, z + 0.5);
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
    if (brightness < NIGHT_BRIGHTNESS) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = SPAWN_INTERVAL_S;
        this.trySpawn(px, pz);
      }
    }
    for (let i = this.stalkers.length - 1; i >= 0; i--) {
      const s = this.stalkers[i];
      if (!s) continue;
      const dx = s.body.x - px;
      const dz = s.body.z - pz;
      const distSq = dx * dx + dz * dz;
      // Burn in daylight, despawn when far.
      if (brightness > DAY_BRIGHTNESS) {
        s.sunTimer += dt;
      } else {
        s.sunTimer = 0;
      }
      if (s.sunTimer > SUNBURN_S || distSq > DESPAWN_DIST * DESPAWN_DIST || s.body.y < -10) {
        this.scene.remove(s.group);
        this.stalkers.splice(i, 1);
        continue;
      }
      this.step(s, world, dt, px, py, pz, distSq, hitPlayer);
      s.group.position.set(s.body.x, s.body.y, s.body.z);
      s.group.rotation.set(0, s.yaw, 0);
      this.animate(s, dt);
    }
    this.updateProjectiles(dt, px, py, pz, hitPlayer);
  }

  /** Limb swing scaled by actual speed, plus the red hurt flash. */
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
      hitPlayer(ATTACK_DAMAGE);
      s.attackCd = ATTACK_COOLDOWN_S;
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
      const b = s.body;
      const t = rayAABB(
        ox, oy, oz, dx, dy, dz,
        b.x - STALKER_HALF_WIDTH, b.y, b.z - STALKER_HALF_WIDTH,
        b.x + STALKER_HALF_WIDTH, b.y + STALKER_HEIGHT, b.z + STALKER_HALF_WIDTH,
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
   * direction for knockback (defaults keep old callers working).
   */
  hurt(stalker: Stalker, kx = 0, kz = 0): boolean {
    stalker.hp -= 2;
    stalker.body.vy = 4; // knock-up
    if (stalker.hp <= 0) {
      const index = this.stalkers.indexOf(stalker);
      if (index >= 0) this.stalkers.splice(index, 1);
      this.scene.remove(stalker.group);
      return true;
    }
    stalker.flash = 0.22;
    stalker.kbX = kx * 6;
    stalker.kbZ = kz * 6;
    return false;
  }
}
