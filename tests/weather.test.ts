/**
 * Weather: pure phase-forecast determinism and its ~30% wet rate, plus the
 * pooled precipitation field — scene wiring, rain filling toward the cap and
 * recycling inside the player cylinder, snow falling slower than rain,
 * clear-mode drain of drops and intensity, clear(), and zero-dt safety.
 * Headless THREE.Scene with a deterministic seeded rng tape — no DOM/WebGL.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DROP_CAP, WET_CHANCE, Weather, weatherPhaseFor, type WeatherMode } from '../src/engine/weather';
import { rngFromSeed } from '../src/world/noise';

const DT = 0.05;
const PY = 64; // player height used throughout

/** The single pooled Points object Weather adds to the scene. */
function findPoints(scene: THREE.Scene): THREE.Points {
  let points: THREE.Points | undefined;
  scene.traverse((obj) => {
    if (obj instanceof THREE.Points) points = obj;
  });
  if (!points) throw new Error('Weather added no Points to the scene');
  return points;
}

/** Step the simulation in fixed 50 ms frames with a stationary player. */
function simulate(weather: Weather, seconds: number, mode: WeatherMode, x = 0, y = PY, z = 0): void {
  const steps = Math.round(seconds / DT);
  for (let s = 0; s < steps; s++) weather.update(DT, x, y, z, mode);
}

/** Indices of live pool slots; dead slots park far below the world. */
function liveSlots(points: THREE.Points): number[] {
  const pos = points.geometry.getAttribute('position').array;
  const live: number[] = [];
  for (let i = 0; i < DROP_CAP; i++) {
    if ((pos[i * 3 + 1] ?? 0) > -1000) live.push(i);
  }
  return live;
}

describe('weatherPhaseFor', () => {
  it('is deterministic: same (seed, cycle) always rolls the same phase', () => {
    for (const seed of [1, 42, 1337, 987654321]) {
      for (let cycle = 0; cycle < 100; cycle++) {
        expect(weatherPhaseFor(seed, cycle)).toBe(weatherPhaseFor(seed, cycle));
      }
    }
  });

  it('different seeds forecast different sequences', () => {
    let differing = 0;
    for (let cycle = 0; cycle < 400; cycle++) {
      if (weatherPhaseFor(42, cycle) !== weatherPhaseFor(1337, cycle)) differing++;
    }
    expect(differing).toBeGreaterThan(50);
  });

  it('rolls roughly 30% wet over 400 cycles', () => {
    expect(WET_CHANCE).toBeCloseTo(0.3, 6);
    for (const seed of [1, 42, 1337, 987654321]) {
      let wet = 0;
      for (let cycle = 0; cycle < 400; cycle++) {
        if (weatherPhaseFor(seed, cycle) === 'wet') wet++;
      }
      expect(wet).toBeGreaterThanOrEqual(400 * 0.22);
      expect(wet).toBeLessThanOrEqual(400 * 0.38);
    }
  });
});

describe('Weather scene wiring', () => {
  it('is one vertex-coloured translucent Points named entity', () => {
    const scene = new THREE.Scene();
    new Weather(scene, rngFromSeed('weather', 'wiring'));
    expect(scene.children.length).toBe(1);
    const points = findPoints(scene);
    expect(points.name).toBe('entity');
    expect(points.frustumCulled).toBe(false);
    const material = points.material;
    if (!(material instanceof THREE.PointsMaterial)) throw new Error('expected PointsMaterial');
    expect(material.vertexColors).toBe(true);
    expect(material.sizeAttenuation).toBe(true);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
  });

  it('resizes the material per spawn mode: 0.12 rain, 0.16 snow', () => {
    const scene = new THREE.Scene();
    const weather = new Weather(scene, rngFromSeed('weather', 'size'));
    const material = findPoints(scene).material;
    if (!(material instanceof THREE.PointsMaterial)) throw new Error('expected PointsMaterial');
    weather.update(DT, 0, PY, 0, 'rain');
    expect(material.size).toBeCloseTo(0.12, 6);
    weather.clear();
    weather.update(DT, 0, PY, 0, 'snow');
    expect(material.size).toBeCloseTo(0.16, 6);
  });
});

describe('Weather rain', () => {
  it('fills toward the cap and recycles drops inside the player cylinder', () => {
    const scene = new THREE.Scene();
    const weather = new Weather(scene, rngFromSeed('weather', 'rain'));
    expect(weather.count).toBe(0);
    // 6 s at 18 m/s is ~108 m of fall, several times the 32 m cylinder height:
    // the pool only stays in band if drops recycle to the top.
    simulate(weather, 6, 'rain');
    expect(weather.count).toBe(DROP_CAP);
    const points = findPoints(scene);
    expect(liveSlots(points).length).toBe(DROP_CAP);
    const pos = points.geometry.getAttribute('position').array;
    let above = 0;
    for (const i of liveSlots(points)) {
      const py = pos[i * 3 + 1] ?? 0;
      expect(py).toBeGreaterThanOrEqual(PY - 8 - 1e-6); // never below the floor
      expect(py).toBeLessThanOrEqual(PY + 24 + 1e-6); // never above the ceiling
      expect(Math.hypot(pos[i * 3] ?? 0, pos[i * 3 + 2] ?? 0)).toBeLessThanOrEqual(22 + 18); // wind slant drifts a little sideways
      if (py > PY + 18) above++;
    }
    expect(above).toBeGreaterThan(0); // some drops sit freshly recycled near the top
  });

  it('drops are pale blue and slant with the wind', () => {
    const scene = new THREE.Scene();
    const weather = new Weather(scene, rngFromSeed('weather', 'tint'));
    simulate(weather, 1, 'rain');
    const points = findPoints(scene);
    const colors = points.geometry.getAttribute('color').array;
    const pos = points.geometry.getAttribute('position').array;
    const before = Array.from(pos);
    weather.update(DT, 0, PY, 0, 'rain');
    let slanted = 0;
    for (const i of liveSlots(points)) {
      // Pale blue: blue-dominant over red and green.
      expect(colors[i * 3 + 2] ?? 0).toBeGreaterThan(colors[i * 3] ?? 0);
      expect(colors[i * 3 + 2] ?? 0).toBeGreaterThan(colors[i * 3 + 1] ?? 0);
      const dx = (pos[i * 3] ?? 0) - (before[i * 3] ?? 0);
      const dy = (pos[i * 3 + 1] ?? 0) - (before[i * 3 + 1] ?? 0);
      if (dy < 0 && dx > 0) slanted++; // falling drops all push +x with the wind
    }
    expect(slanted).toBeGreaterThan(weather.count * 0.8);
  });
});

describe('Weather snow', () => {
  it('falls much slower than rain', () => {
    const fallSpeed = (mode: WeatherMode, salt: string): number => {
      const scene = new THREE.Scene();
      const weather = new Weather(scene, rngFromSeed('weather', salt));
      simulate(weather, 2, mode);
      const points = findPoints(scene);
      const pos = points.geometry.getAttribute('position').array;
      const before = Array.from(pos);
      weather.update(DT, 0, PY, 0, mode);
      let sum = 0;
      let n = 0;
      for (const i of liveSlots(points)) {
        const dy = (pos[i * 3 + 1] ?? 0) - (before[i * 3 + 1] ?? 0);
        if (dy < 0) {
          // skip drops that recycled upward this frame
          sum += -dy / DT;
          n++;
        }
      }
      expect(n).toBeGreaterThan(50);
      return sum / n;
    };
    const rain = fallSpeed('rain', 'speed-rain');
    const snow = fallSpeed('snow', 'speed-snow');
    expect(rain).toBeGreaterThan(14); // ~18 m/s
    expect(snow).toBeLessThan(3.5); // ~2.2 m/s
    expect(rain).toBeGreaterThan(snow * 5);
  });

  it('flakes are white and drift sideways sinusoidally', () => {
    const scene = new THREE.Scene();
    const weather = new Weather(scene, rngFromSeed('weather', 'flakes'));
    simulate(weather, 2, 'snow');
    const points = findPoints(scene);
    const colors = points.geometry.getAttribute('color').array;
    const pos = points.geometry.getAttribute('position').array;
    const slot = liveSlots(points)[0] ?? 0;
    expect(colors[slot * 3] ?? 0).toBeGreaterThan(0.85);
    expect(colors[slot * 3] ?? 0).toBeCloseTo(colors[slot * 3 + 1] ?? 0, 6);
    expect(colors[slot * 3] ?? 0).toBeCloseTo(colors[slot * 3 + 2] ?? 0, 6);
    const x0 = pos[slot * 3] ?? 0;
    simulate(weather, 0.5, 'snow');
    expect(pos[slot * 3]).not.toBeCloseTo(x0, 4); // sway moved it horizontally
  });
});

describe('Weather intensity and clearing', () => {
  it('eases toward 1 while wet at ~0.5/s and drains toward 0 when clear', () => {
    const weather = new Weather(new THREE.Scene(), rngFromSeed('weather', 'intensity'));
    expect(weather.intensity).toBe(0);
    simulate(weather, 1, 'rain');
    expect(weather.intensity).toBeGreaterThan(0.4);
    expect(weather.intensity).toBeLessThan(0.6);
    simulate(weather, 2, 'rain');
    expect(weather.intensity).toBe(1); // saturated after 2 s
    simulate(weather, 1, 'clear');
    expect(weather.intensity).toBeGreaterThan(0.4);
    expect(weather.intensity).toBeLessThan(0.6);
    simulate(weather, 2, 'clear');
    expect(weather.intensity).toBe(0);
  });

  it('clear mode stops spawning and live rain finishes its fall', () => {
    const scene = new THREE.Scene();
    const weather = new Weather(scene, rngFromSeed('weather', 'drain'));
    simulate(weather, 3, 'rain');
    expect(weather.count).toBe(DROP_CAP);
    // Longest fall: ceiling to floor is 32 m at >= 16.2 m/s, under 2 s.
    simulate(weather, 3, 'clear');
    expect(weather.count).toBe(0);
    expect(liveSlots(findPoints(scene)).length).toBe(0);
  });

  it('clear() empties the pool, zeroes intensity, and the storm can restart', () => {
    const scene = new THREE.Scene();
    const weather = new Weather(scene, rngFromSeed('weather', 'clear'));
    simulate(weather, 3, 'snow');
    expect(weather.count).toBeGreaterThan(100);
    expect(weather.intensity).toBeGreaterThan(0.9);
    weather.clear();
    expect(weather.count).toBe(0);
    expect(weather.intensity).toBe(0);
    expect(liveSlots(findPoints(scene)).length).toBe(0);
    simulate(weather, 1, 'rain');
    expect(weather.count).toBeGreaterThan(0);
  });

  it('zero-dt update is a no-op and never NaNs positions', () => {
    const scene = new THREE.Scene();
    const weather = new Weather(scene, rngFromSeed('weather', 'zero'));
    simulate(weather, 1.5, 'rain');
    const points = findPoints(scene);
    const pos = points.geometry.getAttribute('position').array;
    const before = Array.from(pos);
    const count = weather.count;
    const level = weather.intensity;
    weather.update(0, 0, PY, 0, 'rain');
    weather.update(-1, 0, PY, 0, 'rain');
    weather.update(Number.NaN, 0, PY, 0, 'rain');
    expect(weather.count).toBe(count);
    expect(weather.intensity).toBe(level);
    expect(Array.from(pos)).toEqual(before);
    for (const v of before) expect(Number.isFinite(v)).toBe(true);
  });
});
