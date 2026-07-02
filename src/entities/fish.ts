/**
 * Ambient fish: water-bound wildlife that glides through lakes and seas near
 * the player. Movement is heading-based — yaw plus a gentle pitch eased
 * toward a periodically re-rolled wander target, with no gravity — and every
 * candidate move is probed against the voxel grid so a fish never swims out
 * of water: it turns away from walls, dives when it nears the surface and
 * rises off the floor. Fish stranded by drained water flop under gravity and
 * die after a short grace period. Rendering is a body box, a hinged tail fin
 * that wags, a tiny dorsal fin and beady eyes; materials are cloned per fish
 * so the red hurt flash never tints the school. Not persisted — like animals
 * they respawn around the player as ambient wildlife.
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

export const FISH_HALF_WIDTH = 0.2;
export const FISH_HEIGHT = 0.3;
export const FISH_HP = 2;
/** Population cap for the ambient fish around the player. */
export const MAX_FISH = 14;
const SPAWN_INTERVAL_S = 2;
const SPAWN_MIN_DIST = 10;
const SPAWN_MAX_DIST = 30;
const DESPAWN_DIST = 60;
const SCHOOL_MIN = 1; // fish per successful spawn attempt (same kind)
const SCHOOL_MAX = 3;
const SIZE_MIN = 0.8; // per-individual visual scale range (collision unchanged)
const SIZE_MAX = 1.2;
const SWIM_SPEED = 1.4;
const WANDER_MIN_S = 1; // seconds between wander-heading re-rolls
const WANDER_MAX_S = 3;
const WANDER_PITCH = 0.4; // gentle pitch range (radians) of wander targets
const DEPTH_PITCH = 0.35; // dive/rise steering near the surface/floor
const TURN_RATE = 3.2; // yaw easing toward the wander target (1/s)
const PITCH_RATE = 2.4;
const LOOKAHEAD = 0.45; // blocks ahead probed for water before swimming on
const TURN_JITTER = 1.2; // radians of randomness mixed into a wall reflection
const DRY_TIMEOUT_S = 3; // flop this long out of water, then die (drained)
const FLASH_S = 0.22;
const KNOCKBACK = 5;
const WAG_RATE = 7; // tail-wag phase speed while swimming (doubles flopping)
const WAG_AMPLITUDE = 0.55;

/** Fish kinds — three original silhouettes; all drop meat when caught. */
export const FishKind = { dartfin: 0, shadowscale: 1, sunnygill: 2 } as const;
export type FishKindId = (typeof FishKind)[keyof typeof FishKind];

interface KindDef {
  readonly body: readonly [number, number, number];
  readonly tail: readonly [number, number, number];
  readonly dorsal: readonly [number, number, number];
  readonly bodyColor: number;
  readonly finColor: number;
}

// Nose points toward -Z (matching the yaw convention); tail hinges at +Z.
const KINDS: Record<FishKindId, KindDef> = {
  // Dartfin: small and quick-looking, orange-gold.
  [FishKind.dartfin]: {
    body: [0.16, 0.14, 0.3],
    tail: [0.03, 0.12, 0.14],
    dorsal: [0.03, 0.08, 0.1],
    bodyColor: 0xe08c2e,
    finColor: 0xf0b545,
  },
  // Shadowscale: slim and long, steel-blue.
  [FishKind.shadowscale]: {
    body: [0.12, 0.16, 0.5],
    tail: [0.03, 0.14, 0.16],
    dorsal: [0.025, 0.11, 0.16],
    bodyColor: 0x53687d,
    finColor: 0x39485a,
  },
  // Sunnygill: round and deep-bodied, yellow with teal fins.
  [FishKind.sunnygill]: {
    body: [0.22, 0.24, 0.28],
    tail: [0.04, 0.16, 0.12],
    dorsal: [0.035, 0.1, 0.1],
    bodyColor: 0xdcc23c,
    finColor: 0x2e8c7a,
  },
};

export interface Fish {
  readonly body: Body;
  readonly kind: FishKindId;
  yaw: number;
  /** Gentle swim pitch (positive looks up, like the player camera). */
  pitch: number;
  /** Wander heading eased into over time; re-rolled every 1-3 s. */
  targetYaw: number;
  targetPitch: number;
  hp: number;
  /** Seconds until the next wander-heading re-roll. */
  timer: number;
  /** Tail-wag phase; initialised per fish so schools don't wag in sync. */
  phase: number;
  /** Hurt-flash seconds remaining (materials glow red while > 0). */
  flash: number;
  /** Seconds spent out of water (drained); dies past DRY_TIMEOUT_S. */
  flop: number;
  /** Knockback impulse, decaying, added to the swim velocity. */
  kbX: number;
  kbZ: number;
  readonly group: THREE.Group;
  readonly tail: THREE.Mesh;
  /** Per-fish material clones, so the hurt flash never tints the school. */
  readonly mats: readonly THREE.MeshLambertMaterial[];
}

/** Shared per-eye material — eyes never flash, so one instance serves all. */
const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x101318 });

/** Shortest signed angle from `from` to `to`, in [-π, π]. */
function angleDelta(from: number, to: number): number {
  const d = (to - from) % (Math.PI * 2);
  return d > Math.PI ? d - Math.PI * 2 : d < -Math.PI ? d + Math.PI * 2 : d;
}

function makeFishMesh(kind: FishKindId): {
  group: THREE.Group;
  tail: THREE.Mesh;
  mats: THREE.MeshLambertMaterial[];
} {
  const def = KINDS[kind];
  const bodyMat = new THREE.MeshLambertMaterial({ color: def.bodyColor });
  const finMat = new THREE.MeshLambertMaterial({ color: def.finColor });
  const group = new THREE.Group();
  group.name = 'entity';
  group.rotation.order = 'YXZ'; // yaw first, then the gentle swim pitch

  const [bw, bh, bd] = def.body;
  const midY = FISH_HEIGHT / 2; // mesh centred on the collision AABB
  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), bodyMat);
  bodyMesh.name = 'entity';
  bodyMesh.position.set(0, midY, 0);
  group.add(bodyMesh);

  // Tail fin, geometry shifted so the mesh hinges at the body's rear —
  // rotation.y wags it side to side.
  const [tw, th, td] = def.tail;
  const tailGeo = new THREE.BoxGeometry(tw, th, td);
  tailGeo.translate(0, 0, td / 2);
  const tail = new THREE.Mesh(tailGeo, finMat);
  tail.name = 'entity';
  tail.position.set(0, midY, bd / 2 - 0.01);
  group.add(tail);

  // Tiny dorsal fin along the spine.
  const [dw, dh, dd] = def.dorsal;
  const dorsal = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, dd), finMat);
  dorsal.name = 'entity';
  dorsal.position.set(0, midY + bh / 2 + dh / 2 - 0.01, 0.02);
  group.add(dorsal);

  // A beady eye on each flank, near the nose.
  for (const side of [-1, 1] as const) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.045), eyeMaterial);
    eye.name = 'entity';
    eye.position.set(side * (bw / 2 + 0.005), midY + bh * 0.15, -bd / 2 + 0.07);
    group.add(eye);
  }
  return { group, tail, mats: [bodyMat, finMat] };
}

export class FishSystem {
  readonly fishes: Fish[] = [];
  private world: WorldView | null = null;
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

  /** Pause/resume ambient spawning (existing fish keep updating). */
  setSpawning(enabled: boolean): void {
    this.spawnEnabled = enabled;
  }

  clear(): void {
    for (const fish of this.fishes) this.scene.remove(fish.group);
    this.fishes.length = 0;
    this.spawnTimer = 0;
  }

  get count(): number {
    return this.fishes.length;
  }

  /** Place a fish directly (also the test seam). */
  spawnAt(x: number, y: number, z: number, kind?: FishKindId): Fish {
    const k = kind ?? (Math.min(2, Math.floor(this.random() * 3)) as FishKindId);
    const parts = makeFishMesh(k);
    // Per-individual size variety — purely visual: the collision AABB stays
    // FISH_HALF_WIDTH × FISH_HEIGHT for every fish.
    const size = SIZE_MIN + this.random() * (SIZE_MAX - SIZE_MIN);
    parts.group.scale.set(size, size, size);
    const yaw = this.random() * Math.PI * 2;
    const fish: Fish = {
      body: createBody(x, y, z),
      kind: k,
      yaw,
      pitch: 0,
      targetYaw: yaw,
      targetPitch: 0,
      hp: FISH_HP,
      timer: this.random() * WANDER_MAX_S, // stagger so schools desynchronise
      phase: this.random() * Math.PI * 2,
      flash: 0,
      flop: 0,
      kbX: 0,
      kbZ: 0,
      group: parts.group,
      tail: parts.tail,
      mats: parts.mats,
    };
    this.scene.add(fish.group);
    this.fishes.push(fish);
    return fish;
  }

  /**
   * Top-down scan of column (x, z): the y of the topmost water cell, but only
   * when the water there is at least two cells deep; null for dry or shallow
   * columns and for columns whose first non-air block is solid.
   */
  private waterSurfaceY(world: WorldView, x: number, z: number): number | null {
    for (let y = 120; y >= 1; y--) {
      const id = world.getBlock(x, y, z);
      if (id === Block.air) continue;
      if (id !== Block.water) return null;
      return world.getBlock(x, y - 1, z) === Block.water ? y : null;
    }
    return null;
  }

  /**
   * Try to spawn a small school (1-3, all one kind) in open water near the
   * player: pick a random point 10-30 blocks out, scan that column top-down
   * for exposed water at least two deep, and drop the school fully submerged
   * in the second cell down. Truncated at MAX_FISH.
   */
  private trySpawn(px: number, pz: number): void {
    const world = this.world;
    if (!world || this.fishes.length >= MAX_FISH) return;
    const angle = this.random() * Math.PI * 2;
    const dist = SPAWN_MIN_DIST + this.random() * (SPAWN_MAX_DIST - SPAWN_MIN_DIST);
    const x = Math.floor(px + Math.cos(angle) * dist);
    const z = Math.floor(pz + Math.sin(angle) * dist);
    const y = this.waterSurfaceY(world, x, z);
    if (y === null) return;
    const kind = Math.min(2, Math.floor(this.random() * 3)) as FishKindId;
    const school = SCHOOL_MIN + Math.floor(this.random() * (SCHOOL_MAX - SCHOOL_MIN + 1));
    // Centre of the second water cell down: submerged, clear of the surface.
    const spawnY = y - 0.5 - FISH_HEIGHT / 2;
    for (let i = 0; i < school && this.fishes.length < MAX_FISH; i++) {
      this.spawnAt(x + 0.5, spawnY, z + 0.5, kind);
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
    for (let i = this.fishes.length - 1; i >= 0; i--) {
      const fish = this.fishes[i];
      if (!fish) continue;
      const body = fish.body;
      const inWater =
        world.getBlock(Math.floor(body.x), Math.floor(body.y + FISH_HEIGHT / 2), Math.floor(body.z)) ===
        Block.water;
      if (inWater) fish.flop = 0;
      else fish.flop += dt; // stranded (drained water) — dies past the grace
      const dx = body.x - px;
      const dy = body.y - py;
      const dz = body.z - pz;
      if (
        dx * dx + dy * dy + dz * dz > DESPAWN_DIST * DESPAWN_DIST ||
        body.y < -10 ||
        fish.flop > DRY_TIMEOUT_S
      ) {
        this.scene.remove(fish.group);
        this.fishes.splice(i, 1);
        continue;
      }
      if (inWater) this.swim(fish, world, dt);
      else this.flopStep(fish, world, dt);
      fish.group.position.set(body.x, body.y, body.z);
      // Stranded fish roll onto their sides and rock as they flop.
      fish.group.rotation.set(fish.pitch, fish.yaw, inWater ? 0 : Math.sin(fish.phase * 2.5) * 0.7);
      this.animate(fish, dt, inWater);
    }
  }

  /** Tail wag (faster while flopping) and the red hurt flash. */
  private animate(fish: Fish, dt: number, inWater: boolean): void {
    fish.phase += dt * (inWater ? WAG_RATE : WAG_RATE * 2.2);
    fish.tail.rotation.y = Math.sin(fish.phase) * WAG_AMPLITUDE;
    if (fish.flash > 0) {
      fish.flash -= dt;
      const on = fish.flash > 0;
      for (const m of fish.mats) m.emissive.setRGB(on ? 0.55 : 0, 0, 0);
    }
  }

  /** Is the cell `dist` blocks ahead of the fish's nose water? */
  private waterAhead(fish: Fish, world: WorldView, dist: number): boolean {
    const body = fish.body;
    const cosPitch = Math.cos(fish.pitch);
    const ax = body.x - Math.sin(fish.yaw) * cosPitch * dist;
    const ay = body.y + FISH_HEIGHT / 2 + Math.sin(fish.pitch) * dist;
    const az = body.z - Math.cos(fish.yaw) * cosPitch * dist;
    return world.getBlock(Math.floor(ax), Math.floor(ay), Math.floor(az)) === Block.water;
  }

  /** Reflect the heading (± jitter) so the fish swims back into open water. */
  private turnAway(fish: Fish): void {
    fish.yaw += Math.PI + (this.random() - 0.5) * TURN_JITTER;
    fish.targetYaw = fish.yaw;
    fish.pitch = -fish.pitch;
    fish.targetPitch = -fish.targetPitch;
  }

  /**
   * Water-bound glide: no gravity. Ease yaw/pitch toward the wander target,
   * turn away when the cell ahead is not water, and hard-gate the actual
   * displacement per axis (plus the combined diagonal) so the fish's centre
   * cell always stays water. Solids are still swept via moveBody.
   */
  private swim(fish: Fish, world: WorldView, dt: number): void {
    const body = fish.body;
    fish.timer -= dt;
    if (fish.timer <= 0) {
      fish.targetYaw = this.random() * Math.PI * 2;
      fish.targetPitch = (this.random() * 2 - 1) * WANDER_PITCH;
      fish.timer = WANDER_MIN_S + this.random() * (WANDER_MAX_S - WANDER_MIN_S);
    }
    const cx = Math.floor(body.x);
    const cy = Math.floor(body.y + FISH_HEIGHT / 2);
    const cz = Math.floor(body.z);
    // Soft depth preference: dive within a block of the surface, rise off the
    // floor (both non-water ⇒ a one-deep pocket; the gates keep it inside).
    if (world.getBlock(cx, cy + 1, cz) !== Block.water) {
      fish.targetPitch = Math.min(fish.targetPitch, -DEPTH_PITCH);
    } else if (world.getBlock(cx, cy - 1, cz) !== Block.water) {
      fish.targetPitch = Math.max(fish.targetPitch, DEPTH_PITCH);
    }
    fish.yaw += angleDelta(fish.yaw, fish.targetYaw) * Math.min(1, dt * TURN_RATE);
    fish.pitch += (fish.targetPitch - fish.pitch) * Math.min(1, dt * PITCH_RATE);
    // The cell ahead must be water, otherwise reflect the heading away now.
    if (!this.waterAhead(fish, world, LOOKAHEAD)) this.turnAway(fish);
    const cosPitch = Math.cos(fish.pitch);
    let vx = -Math.sin(fish.yaw) * cosPitch * SWIM_SPEED + fish.kbX;
    let vy = Math.sin(fish.pitch) * SWIM_SPEED;
    let vz = -Math.cos(fish.yaw) * cosPitch * SWIM_SPEED + fish.kbZ;
    const kbDecay = Math.max(0, 1 - dt * 5);
    fish.kbX *= kbDecay;
    fish.kbZ *= kbDecay;
    // Hard gate, per axis then combined: never step the centre out of water.
    const midY = body.y + FISH_HEIGHT / 2;
    if (world.getBlock(Math.floor(body.x + vx * dt), cy, cz) !== Block.water) vx = 0;
    if (world.getBlock(cx, Math.floor(midY + vy * dt), cz) !== Block.water) vy = 0;
    if (world.getBlock(cx, cy, Math.floor(body.z + vz * dt)) !== Block.water) vz = 0;
    if (
      world.getBlock(Math.floor(body.x + vx * dt), Math.floor(midY + vy * dt), Math.floor(body.z + vz * dt)) !==
      Block.water
    ) {
      vx = vy = vz = 0; // diagonal corner the per-axis gates cannot see
    }
    body.vx = vx;
    body.vy = vy;
    body.vz = vz;
    moveBody(world.isSolid, body, vx * dt, vy * dt, vz * dt, this.moveResult, FISH_HALF_WIDTH, FISH_HEIGHT);
  }

  /** Out of water: gravity applies; grounded fish hop about helplessly. */
  private flopStep(fish: Fish, world: WorldView, dt: number): void {
    const body = fish.body;
    if (body.onGround) {
      body.vy = 2.2 + this.random() * 1.4;
      body.vx = (this.random() - 0.5) * 1.6;
      body.vz = (this.random() - 0.5) * 1.6;
    } else {
      body.vy -= GRAVITY * dt;
      if (body.vy < -TERMINAL_VELOCITY) body.vy = -TERMINAL_VELOCITY;
      const drag = Math.max(0, 1 - dt * 4);
      body.vx *= drag;
      body.vz *= drag;
    }
    moveBody(
      world.isSolid,
      body,
      body.vx * dt,
      body.vy * dt,
      body.vz * dt,
      this.moveResult,
      FISH_HALF_WIDTH,
      FISH_HEIGHT,
    );
  }

  /** Nearest fish hit by the ray within maxDist, or null. */
  raycastNearest(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDist: number,
  ): { fish: Fish; distance: number } | null {
    let best: Fish | null = null;
    let bestT = maxDist;
    for (const fish of this.fishes) {
      const b = fish.body;
      const t = rayAABB(
        ox, oy, oz, dx, dy, dz,
        b.x - FISH_HALF_WIDTH, b.y, b.z - FISH_HALF_WIDTH,
        b.x + FISH_HALF_WIDTH, b.y + FISH_HEIGHT, b.z + FISH_HALF_WIDTH,
      );
      if (t !== null && t <= bestT) {
        best = fish;
        bestT = t;
      }
    }
    return best ? { fish: best, distance: bestT } : null;
  }

  /**
   * Punch a fish; returns its drop when it dies (meat ×1), else null.
   * (kx, kz) is the attack direction for knockback.
   */
  hurt(fish: Fish, kx = 0, kz = 0): { id: number; count: number } | null {
    fish.hp--;
    if (fish.hp <= 0) {
      const index = this.fishes.indexOf(fish);
      if (index >= 0) this.fishes.splice(index, 1);
      this.scene.remove(fish.group);
      return { id: Item.meat, count: 1 };
    }
    fish.flash = FLASH_S;
    fish.kbX = kx * KNOCKBACK;
    fish.kbZ = kz * KNOCKBACK;
    return null;
  }
}
