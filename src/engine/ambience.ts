/**
 * Living atmosphere: a pooled field of ambient motes drifting around the
 * player so every scene feels alive. One THREE.Points, one draw call. The
 * current mode shapes NEW spawns only — night breeds wandering fireflies, day
 * breeds airy sinking pollen, the underworld breeds rising embers — so a mode
 * flip crossfades: live motes keep their spawn-time look and expire naturally
 * while replacements take on the new palette. Zero-allocation update: typed
 * arrays and in-place loops only; dead slots park far below the world.
 */
import * as THREE from 'three';

/** Scene context for spawns; main derives it from dimension + brightness. */
export type AmbienceMode = 'day' | 'night' | 'underworld';

/** Pool size — also the live cap for 'night' and 'underworld'. */
export const MOTE_CAP = 48;
/** 'day' runs at ~60% of the pool so daylight feels airier. */
export const DAY_CAP = Math.round(MOTE_CAP * 0.6);

const SPAWN_PER_SEC = 12; // refill rate toward the cap
const SPAWN_R_MIN = 6; // horizontal spawn ring around the player, meters
const SPAWN_R_MAX = 18;
const SPAWN_Y_SPREAD = 4; // vertical spawn bias: within ±4 of the player
const LIFE_MIN_S = 6;
const LIFE_MAX_S = 14;
const CULL_DIST_SQ = 26 * 26; // left-behind motes past 26 m die immediately
const FADE_OUT_S = 1.5; // soft despawn: brightness ramps to zero at end of life
const MOTE_SIZE = 0.09;
const PARK_Y = -9999;
const TWO_PI = Math.PI * 2;

// Per-mote behaviour tags; a mote keeps its spawn mode for its whole life.
const MODE_DAY = 0;
const MODE_NIGHT = 1;
const MODE_UNDERWORLD = 2;

export class Ambience {
  private readonly positions = new Float32Array(MOTE_CAP * 3);
  private readonly colors = new Float32Array(MOTE_CAP * 3);
  private readonly baseColors = new Float32Array(MOTE_CAP * 3);
  private readonly velocities = new Float32Array(MOTE_CAP * 3);
  private readonly life = new Float32Array(MOTE_CAP);
  private readonly phase = new Float32Array(MOTE_CAP);
  private readonly moteMode = new Uint8Array(MOTE_CAP);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly positionAttr: THREE.BufferAttribute;
  private readonly colorAttr: THREE.BufferAttribute;
  private time = 0;
  private spawnAccum = 0;
  private cursor = 0;
  private liveCount = 0;

  constructor(scene: THREE.Scene, private readonly random: () => number = Math.random) {
    for (let i = 0; i < MOTE_CAP; i++) this.positions[i * 3 + 1] = PARK_Y;
    this.positionAttr = new THREE.BufferAttribute(this.positions, 3);
    this.colorAttr = new THREE.BufferAttribute(this.colors, 3);
    this.geometry.setAttribute('position', this.positionAttr);
    this.geometry.setAttribute('color', this.colorAttr);
    const points = new THREE.Points(
      this.geometry,
      new THREE.PointsMaterial({
        size: MOTE_SIZE,
        vertexColors: true,
        sizeAttenuation: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending, // motes add into the scene: cheap glow
      }),
    );
    points.name = 'entity';
    points.frustumCulled = false;
    scene.add(points);
  }

  /** Live motes (tests, HUD debug). */
  get count(): number {
    return this.liveCount;
  }

  /**
   * Advance the field around the player at (x, y, z): integrate live motes in
   * place, age them out (softly, via a brightness fade over the last moments),
   * cull any left more than 26 m behind, re-modulate every live vertex colour
   * by its per-mote flicker, then spawn replacements toward `mode`'s cap.
   * Zero/negative/NaN dt is an explicit no-op.
   */
  update(dt: number, x: number, y: number, z: number, mode: AmbienceMode): void {
    if (!(dt > 0)) return;
    this.time += dt;
    const t = this.time;

    for (let i = 0; i < MOTE_CAP; i++) {
      const remaining = this.life[i] ?? 0;
      if (remaining <= 0) continue;
      const next = remaining - dt;
      const i3 = i * 3;
      let px = this.positions[i3] ?? 0;
      let py = this.positions[i3 + 1] ?? 0;
      let pz = this.positions[i3 + 2] ?? 0;
      const dx = px - x;
      const dy = py - y;
      const dz = pz - z;
      if (next <= 0 || dx * dx + dy * dy + dz * dz > CULL_DIST_SQ) {
        this.kill(i);
        continue;
      }
      this.life[i] = next;
      const ph = this.phase[i] ?? 0;
      const vx = this.velocities[i3] ?? 0;
      const vy = this.velocities[i3 + 1] ?? 0;
      const vz = this.velocities[i3 + 2] ?? 0;
      const m = this.moteMode[i] ?? MODE_DAY;
      let flick: number;
      if (m === MODE_NIGHT) {
        // Firefly: slow wandering drift with a gentle sinusoidal velocity
        // wobble; brightness pulses deeply on the mote's own phase.
        px += (vx + Math.sin(t * 0.9 + ph) * 0.3) * dt;
        py += (vy + Math.sin(t * 0.7 + ph * 2.1) * 0.16) * dt;
        pz += (vz + Math.cos(t * 0.8 + ph * 1.4) * 0.3) * dt;
        flick = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 3.2 + ph * 4));
      } else if (m === MODE_UNDERWORLD) {
        // Ember: rises steadily, jitters sideways, flickers hard and fast.
        px += (vx + Math.sin(t * 7 + ph * 3) * 0.12) * dt;
        py += vy * dt;
        pz += (vz + Math.cos(t * 6 + ph * 5) * 0.12) * dt;
        flick = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 6.5 + ph * 5));
      } else {
        // Pollen/dust: sinks very slowly, wafts sideways, barely shimmers.
        px += (vx + Math.sin(t * 0.6 + ph) * 0.18) * dt;
        py += vy * dt;
        pz += (vz + Math.cos(t * 0.5 + ph * 1.3) * 0.18) * dt;
        flick = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin(t * 1.2 + ph * 2));
      }
      this.positions[i3] = px;
      this.positions[i3 + 1] = py;
      this.positions[i3 + 2] = pz;
      const glow = Math.min(1, next / FADE_OUT_S) * flick;
      this.colors[i3] = (this.baseColors[i3] ?? 0) * glow;
      this.colors[i3 + 1] = (this.baseColors[i3 + 1] ?? 0) * glow;
      this.colors[i3 + 2] = (this.baseColors[i3 + 2] ?? 0) * glow;
    }

    // Continuous spawning. Tokens drain even while at the cap so a full pool
    // never banks a burst for later.
    const cap = mode === 'day' ? DAY_CAP : MOTE_CAP;
    this.spawnAccum += dt * SPAWN_PER_SEC;
    while (this.spawnAccum >= 1) {
      this.spawnAccum -= 1;
      if (this.liveCount < cap) this.spawn(mode, x, y, z);
    }

    this.positionAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  /** Instantly remove every mote (world/dimension switches). */
  clear(): void {
    for (let i = 0; i < MOTE_CAP; i++) {
      if ((this.life[i] ?? 0) > 0) this.kill(i);
    }
    this.spawnAccum = 0;
    this.positionAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  private kill(i: number): void {
    const i3 = i * 3;
    this.life[i] = 0;
    this.positions[i3 + 1] = PARK_Y;
    this.colors[i3] = 0;
    this.colors[i3 + 1] = 0;
    this.colors[i3 + 2] = 0;
    this.liveCount--;
  }

  /** Bring one dead slot to life near (x, y, z) with `mode`'s look. */
  private spawn(mode: AmbienceMode, x: number, y: number, z: number): void {
    let slot = -1;
    for (let n = 0; n < MOTE_CAP; n++) {
      const i = (this.cursor + n) % MOTE_CAP;
      if ((this.life[i] ?? 0) <= 0) {
        slot = i;
        break;
      }
    }
    if (slot < 0) return;
    this.cursor = (slot + 1) % MOTE_CAP;
    const r = this.random;
    const i3 = slot * 3;
    const angle = r() * TWO_PI;
    const dist = SPAWN_R_MIN + r() * (SPAWN_R_MAX - SPAWN_R_MIN);
    this.positions[i3] = x + Math.cos(angle) * dist;
    this.positions[i3 + 1] = y + (r() * 2 - 1) * SPAWN_Y_SPREAD;
    this.positions[i3 + 2] = z + Math.sin(angle) * dist;
    this.life[slot] = LIFE_MIN_S + r() * (LIFE_MAX_S - LIFE_MIN_S);
    this.phase[slot] = r() * TWO_PI;
    if (mode === 'night') {
      this.moteMode[slot] = MODE_NIGHT;
      this.velocities[i3] = (r() - 0.5) * 0.5;
      this.velocities[i3 + 1] = (r() - 0.5) * 0.3;
      this.velocities[i3 + 2] = (r() - 0.5) * 0.5;
      this.baseColors[i3] = 0.55 + r() * 0.15; // warm yellow-green firefly glow
      this.baseColors[i3 + 1] = 0.9 + r() * 0.1;
      this.baseColors[i3 + 2] = 0.18 + r() * 0.08;
    } else if (mode === 'underworld') {
      this.moteMode[slot] = MODE_UNDERWORLD;
      this.velocities[i3] = (r() - 0.5) * 0.2;
      this.velocities[i3 + 1] = 0.4 + r() * 0.6; // embers rise 0.4..1.0 m/s
      this.velocities[i3 + 2] = (r() - 0.5) * 0.2;
      this.baseColors[i3] = 0.95 + r() * 0.05; // orange-red
      this.baseColors[i3 + 1] = 0.3 + r() * 0.15;
      this.baseColors[i3 + 2] = 0.04 + r() * 0.05;
    } else {
      this.moteMode[slot] = MODE_DAY;
      this.velocities[i3] = (r() - 0.5) * 0.1;
      this.velocities[i3 + 1] = -(0.12 + r() * 0.18); // pollen sinks slowly
      this.velocities[i3 + 2] = (r() - 0.5) * 0.1;
      const shade = 0.42 + r() * 0.1; // faint warm white
      this.baseColors[i3] = shade + 0.08;
      this.baseColors[i3 + 1] = shade + 0.04;
      this.baseColors[i3 + 2] = shade - 0.06;
    }
    // First frame shows the raw base tint; flicker modulates from next update.
    this.colors[i3] = this.baseColors[i3] ?? 0;
    this.colors[i3 + 1] = this.baseColors[i3 + 1] ?? 0;
    this.colors[i3 + 2] = this.baseColors[i3 + 2] ?? 0;
    this.liveCount++;
  }
}
