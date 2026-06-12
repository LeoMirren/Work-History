/**
 * Day/night cycle (§4.10): a 480s loop driving one global brightness value.
 * Brightness multiplies the three shared chunk materials' color and lerps the
 * sky/fog colors — that is the entire lighting model.
 */
import * as THREE from 'three';
import type { GameRenderer } from './renderer';

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

export class DayNight {
  time = NOON_TIME;
  private readonly sky = new THREE.Color();

  advance(dt: number): void {
    this.time += dt;
  }

  /** Push brightness into sky, fog and the shared materials. Call per frame. */
  apply(renderer: GameRenderer, materials: readonly THREE.MeshBasicMaterial[]): void {
    const b = brightnessAt(this.time);
    this.sky.lerpColors(NIGHT_SKY, DAY_SKY, b);
    renderer.setClearColor(this.sky);
    if (renderer.scene.fog) renderer.scene.fog.color.copy(this.sky);
    for (const m of materials) m.color.setScalar(b);
  }
}
