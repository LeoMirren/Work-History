/**
 * Day/night cycle (§4.10): a 480s loop driving one global brightness value.
 * Brightness multiplies the three shared chunk materials' color and lerps the
 * sky/fog colors — that is the entire lighting model.
 */
import * as THREE from 'three';
import type { GameRenderer } from './renderer';
import type { ChunkMaterialSet } from './materials';

export const DAY_LENGTH_SECONDS = 480;
/** New worlds start at noon (peak brightness). */
export const NOON_TIME = DAY_LENGTH_SECONDS * 0.25;

const NIGHT_SKY = new THREE.Color('#0a0e1f');
const DAY_SKY = new THREE.Color('#8ecae6');

export function brightnessAt(timeSeconds: number): number {
  const t = (((timeSeconds % DAY_LENGTH_SECONDS) + DAY_LENGTH_SECONDS) % DAY_LENGTH_SECONDS) / DAY_LENGTH_SECONDS;
  const b = 0.18 + 0.82 * Math.max(0, Math.sin(t * Math.PI * 2));
  return Math.min(1, Math.max(0.18, b));
}

/** Below this brightness it's dark enough to sleep (mirrors mob spawn). */
export const SLEEP_BRIGHTNESS = 0.34;
const MORNING_FRACTION = 0.2; // wake here (well into the rising day)

export function isNightTime(timeSeconds: number): boolean {
  return brightnessAt(timeSeconds) < SLEEP_BRIGHTNESS;
}

/** The next "morning" instant strictly after `time` (used by sleeping). */
export function nextDay(timeSeconds: number): number {
  const base = Math.floor(timeSeconds / DAY_LENGTH_SECONDS) * DAY_LENGTH_SECONDS;
  let candidate = base + MORNING_FRACTION * DAY_LENGTH_SECONDS;
  if (candidate <= timeSeconds) candidate += DAY_LENGTH_SECONDS;
  return candidate;
}

export class DayNight {
  time = NOON_TIME;
  private readonly sky = new THREE.Color();

  advance(dt: number): void {
    this.time += dt;
  }

  /** Push brightness into sky, fog uniforms and materials. Call per frame. */
  apply(renderer: GameRenderer, chunk: ChunkMaterialSet, clouds: THREE.MeshBasicMaterial): void {
    const b = brightnessAt(this.time);
    this.sky.lerpColors(NIGHT_SKY, DAY_SKY, b);
    renderer.setClearColor(this.sky);
    for (const m of [chunk.opaque, chunk.cutout, chunk.water]) {
      m.uniforms.uBrightness.value = b;
      m.uniforms.fogColor.value.copy(this.sky);
    }
    // Clouds catch the light: grey-dim at night, white at noon, and warmed
    // toward ember-rose through dawn and dusk (the low-sun band).
    const warmth = Math.max(0, 1 - Math.abs(b - 0.45) / 0.3);
    clouds.color.setRGB(
      Math.min(1, b + warmth * 0.28),
      Math.max(0, b + warmth * 0.02),
      Math.max(0, b - warmth * 0.1),
    );
  }
}
