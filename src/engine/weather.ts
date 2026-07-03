/**
 * Weather: deterministic clear/wet cycles plus a pooled precipitation field.
 * `weatherPhaseFor` is a pure hash roll — main splits each in-game day into 4
 * cycles and asks whether cycle N of a seed is 'clear' (~70%) or 'wet' (~30%),
 * so every client of a seed agrees on the forecast forever. `Weather` renders
 * the wet phases: one THREE.Points pool of ~420 drops in a cylinder around the
 * player. 'rain' spawns thin pale-blue streak points falling fast with a slight
 * wind slant; 'snow' spawns white flakes sinking slowly on a sinusoidal drift.
 * Drops that fall past the floor recycle to the cylinder top with the CURRENT
 * mode's look (retint + resize per spawn); in 'clear' mode spawning stops and
 * live drops finish their fall. `intensity` eases 0..1 at ~0.5/s so main can
 * dim sky/light softly. Zero-allocation update: typed arrays, in-place loops;
 * dead slots park far below the world.
 */
import * as THREE from 'three';
import { hash2 } from '../world/noise';

/** What the sky is doing right now; main maps 'wet' to rain or snow by biome. */
export type WeatherMode = 'clear' | 'rain' | 'snow';

/** Forecast outcome of one quarter-day cycle. */
export type WeatherPhase = 'clear' | 'wet';

/** Pool size: enough drops to read as a storm at radius 22 without a blizzardy fill. */
export const DROP_CAP = 420;
/** Chance a cycle rolls 'wet'. */
export const WET_CHANCE = 0.3;

const SPAWN_PER_SEC = 240; // pool fills in under 2 s once a wet cycle starts
const CYL_RADIUS = 22; // horizontal spawn/recycle cylinder around the player
const CYL_TOP = 24; // cylinder ceiling, meters above the player
const FLOOR_BELOW = 8; // drops below player-8 recycle (wet) or die (clear)
const RAIN_FALL = 18; // m/s
const RAIN_WIND_X = 2.2; // slight constant wind slant
const SNOW_FALL = 2.2; // m/s
const SNOW_DRIFT = 0.9; // sinusoidal sway amplitude, m/s
const RAIN_SIZE = 0.12;
const SNOW_SIZE = 0.16;
const INTENSITY_RATE = 0.5; // per second toward 0 (clear) or 1 (wet)
const PARK_Y = -9999;
const TWO_PI = Math.PI * 2;

// Per-drop behaviour tags; a drop keeps its spawn look until it recycles.
const DROP_RAIN = 0;
const DROP_SNOW = 1;

/**
 * Pure forecast for cycle `cycleIndex` of world `seedInt` (four cycles per
 * in-game day; main computes floor(dayTime / (DAY_LENGTH / 4)) + dayCount * 4).
 * Same (seed, index) always rolls the same phase: ~70% clear, ~30% wet.
 */
export function weatherPhaseFor(seedInt: number, cycleIndex: number): WeatherPhase {
  const roll = hash2(seedInt, cycleIndex, 0x5eed) / 4294967296;
  return roll < WET_CHANCE ? 'wet' : 'clear';
}

export class Weather {
  private readonly positions = new Float32Array(DROP_CAP * 3);
  private readonly colors = new Float32Array(DROP_CAP * 3);
  private readonly velocities = new Float32Array(DROP_CAP * 3);
  private readonly phase = new Float32Array(DROP_CAP);
  private readonly dropMode = new Uint8Array(DROP_CAP);
  private readonly alive = new Uint8Array(DROP_CAP);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly positionAttr: THREE.BufferAttribute;
  private readonly colorAttr: THREE.BufferAttribute;
  private readonly material: THREE.PointsMaterial;
  private time = 0;
  private spawnAccum = 0;
  private cursor = 0;
  private liveCount = 0;
  private level = 0;

  constructor(scene: THREE.Scene, private readonly random: () => number = Math.random) {
    for (let i = 0; i < DROP_CAP; i++) this.positions[i * 3 + 1] = PARK_Y;
    this.positionAttr = new THREE.BufferAttribute(this.positions, 3);
    this.colorAttr = new THREE.BufferAttribute(this.colors, 3);
    this.geometry.setAttribute('position', this.positionAttr);
    this.geometry.setAttribute('color', this.colorAttr);
    this.material = new THREE.PointsMaterial({
      size: RAIN_SIZE,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const points = new THREE.Points(this.geometry, this.material);
    points.name = 'entity';
    points.frustumCulled = false;
    scene.add(points);
  }

  /** Live drops (tests, HUD debug). */
  get count(): number {
    return this.liveCount;
  }

  /** Storm strength 0..1, eased at ~0.5/s — main dims sky/light with it. */
  get intensity(): number {
    return this.level;
  }

  /**
   * Advance the field around the player at (x, y, z). Live drops integrate in
   * place: rain falls fast with its wind slant, snow sinks slowly swaying on
   * its per-drop phase. A drop below player-8 recycles to the cylinder top
   * when `mode` is wet (taking the current mode's tint/size/velocity) or dies
   * when clear. Wet modes then spawn toward the cap; intensity eases toward 1
   * (wet) or 0 (clear). Zero/negative/NaN dt is an explicit no-op.
   */
  update(dt: number, x: number, y: number, z: number, mode: WeatherMode): void {
    if (!(dt > 0)) return;
    this.time += dt;
    const t = this.time;
    const wet = mode !== 'clear';
    const floor = y - FLOOR_BELOW;

    for (let i = 0; i < DROP_CAP; i++) {
      if ((this.alive[i] ?? 0) === 0) continue;
      const i3 = i * 3;
      let px = this.positions[i3] ?? 0;
      let py = this.positions[i3 + 1] ?? 0;
      let pz = this.positions[i3 + 2] ?? 0;
      if ((this.dropMode[i] ?? DROP_RAIN) === DROP_SNOW) {
        const ph = this.phase[i] ?? 0;
        px += ((this.velocities[i3] ?? 0) + Math.sin(t * 1.3 + ph) * SNOW_DRIFT) * dt;
        py += (this.velocities[i3 + 1] ?? 0) * dt;
        pz += ((this.velocities[i3 + 2] ?? 0) + Math.cos(t * 1.1 + ph * 1.7) * SNOW_DRIFT) * dt;
      } else {
        px += (this.velocities[i3] ?? 0) * dt;
        py += (this.velocities[i3 + 1] ?? 0) * dt;
        pz += (this.velocities[i3 + 2] ?? 0) * dt;
      }
      if (py < floor) {
        if (wet) {
          this.respawn(i, mode, x, y, z, true);
        } else {
          this.kill(i);
        }
        continue;
      }
      this.positions[i3] = px;
      this.positions[i3 + 1] = py;
      this.positions[i3 + 2] = pz;
    }

    if (wet) {
      // Tokens drain even at the cap so a full pool never banks a burst.
      this.spawnAccum += dt * SPAWN_PER_SEC;
      while (this.spawnAccum >= 1) {
        this.spawnAccum -= 1;
        if (this.liveCount < DROP_CAP) this.spawnFresh(mode, x, y, z);
      }
    } else {
      this.spawnAccum = 0;
    }

    const target = wet ? 1 : 0;
    if (this.level < target) this.level = Math.min(target, this.level + INTENSITY_RATE * dt);
    else if (this.level > target) this.level = Math.max(target, this.level - INTENSITY_RATE * dt);

    this.positionAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  /** Instantly remove every drop and zero intensity (world/dimension switches). */
  clear(): void {
    for (let i = 0; i < DROP_CAP; i++) {
      if ((this.alive[i] ?? 0) !== 0) this.kill(i);
    }
    this.spawnAccum = 0;
    this.level = 0;
    this.positionAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  private kill(i: number): void {
    const i3 = i * 3;
    this.alive[i] = 0;
    this.positions[i3 + 1] = PARK_Y;
    this.colors[i3] = 0;
    this.colors[i3 + 1] = 0;
    this.colors[i3 + 2] = 0;
    this.liveCount--;
  }

  /** Bring one dead slot to life somewhere inside the cylinder. */
  private spawnFresh(mode: WeatherMode, x: number, y: number, z: number): void {
    let slot = -1;
    for (let n = 0; n < DROP_CAP; n++) {
      const i = (this.cursor + n) % DROP_CAP;
      if ((this.alive[i] ?? 0) === 0) {
        slot = i;
        break;
      }
    }
    if (slot < 0) return;
    this.cursor = (slot + 1) % DROP_CAP;
    this.alive[slot] = 1;
    this.liveCount++;
    this.respawn(slot, mode, x, y, z, false);
  }

  /**
   * (Re)seat drop `i` with `mode`'s look: retint, resize the material for the
   * mode, roll velocity/phase. `atTop` pins it to the cylinder ceiling (drop
   * recycling); otherwise it lands at a random height so a starting storm
   * fills the whole volume instead of descending as a sheet.
   */
  private respawn(i: number, mode: WeatherMode, x: number, y: number, z: number, atTop: boolean): void {
    const r = this.random;
    const i3 = i * 3;
    const angle = r() * TWO_PI;
    const dist = Math.sqrt(r()) * CYL_RADIUS; // sqrt: uniform over the disc
    this.positions[i3] = x + Math.cos(angle) * dist;
    this.positions[i3 + 1] = atTop ? y + CYL_TOP - r() * 2 : y - FLOOR_BELOW + r() * (CYL_TOP + FLOOR_BELOW);
    this.positions[i3 + 2] = z + Math.sin(angle) * dist;
    this.phase[i] = r() * TWO_PI;
    if (mode === 'snow') {
      this.dropMode[i] = DROP_SNOW;
      this.velocities[i3] = (r() - 0.5) * 0.3;
      this.velocities[i3 + 1] = -SNOW_FALL * (0.85 + r() * 0.3);
      this.velocities[i3 + 2] = (r() - 0.5) * 0.3;
      const shade = 0.9 + r() * 0.1; // soft white flake
      this.colors[i3] = shade;
      this.colors[i3 + 1] = shade;
      this.colors[i3 + 2] = shade;
      this.material.size = SNOW_SIZE;
    } else {
      this.dropMode[i] = DROP_RAIN;
      this.velocities[i3] = RAIN_WIND_X * (0.7 + r() * 0.6); // slight wind slant
      this.velocities[i3 + 1] = -RAIN_FALL * (0.9 + r() * 0.2);
      this.velocities[i3 + 2] = (r() - 0.5) * 0.8;
      this.colors[i3] = 0.5 + r() * 0.08; // thin pale-blue streak
      this.colors[i3 + 1] = 0.62 + r() * 0.08;
      this.colors[i3 + 2] = 0.9 + r() * 0.1;
      this.material.size = RAIN_SIZE;
    }
  }
}
