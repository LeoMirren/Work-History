/**
 * Ambience motes: scene wiring, pool fill toward the night cap, the airier
 * ~60% day cap, live retint on mode switches (old motes persist, new spawns
 * take the new palette), distance culling, clear(), and zero-dt safety.
 * Headless THREE.Scene with a deterministic seeded rng tape — no DOM/WebGL.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Ambience, DAY_CAP, MOTE_CAP, type AmbienceMode } from '../src/engine/ambience';
import { rngFromSeed } from '../src/world/noise';

const DT = 0.05;

/** The single pooled Points object Ambience adds to the scene. */
function findPoints(scene: THREE.Scene): THREE.Points {
  let points: THREE.Points | undefined;
  scene.traverse((obj) => {
    if (obj instanceof THREE.Points) points = obj;
  });
  if (!points) throw new Error('Ambience added no Points to the scene');
  return points;
}

/** Step the simulation in fixed 50 ms frames with a stationary player. */
function simulate(amb: Ambience, seconds: number, mode: AmbienceMode, x = 0, y = 64, z = 0): void {
  const steps = Math.round(seconds / DT);
  for (let s = 0; s < steps; s++) amb.update(DT, x, y, z, mode);
}

/** Indices of live pool slots; dead slots park far below the world. */
function liveSlots(points: THREE.Points): number[] {
  const pos = points.geometry.getAttribute('position').array;
  const live: number[] = [];
  for (let i = 0; i < MOTE_CAP; i++) {
    if ((pos[i * 3 + 1] ?? 0) > -1000) live.push(i);
  }
  return live;
}

describe('Ambience scene wiring', () => {
  it('is one additive vertex-coloured Points named entity', () => {
    const scene = new THREE.Scene();
    new Ambience(scene, rngFromSeed('ambience', 'wiring'));
    expect(scene.children.length).toBe(1);
    const points = findPoints(scene);
    expect(points.name).toBe('entity');
    expect(points.frustumCulled).toBe(false);
    const material = points.material;
    if (!(material instanceof THREE.PointsMaterial)) throw new Error('expected PointsMaterial');
    expect(material.size).toBeCloseTo(0.09, 6);
    expect(material.vertexColors).toBe(true);
    expect(material.sizeAttenuation).toBe(true);
    expect(material.transparent).toBe(true);
  });
});

describe('Ambience spawning', () => {
  it('night fills the pool toward the cap and holds it there', () => {
    const scene = new THREE.Scene();
    const amb = new Ambience(scene, rngFromSeed('ambience', 'fill'));
    expect(amb.count).toBe(0);
    simulate(amb, 2, 'night');
    const early = amb.count;
    expect(early).toBeGreaterThan(0);
    simulate(amb, 10, 'night');
    expect(amb.count).toBeGreaterThan(early); // keeps climbing, then holds
    expect(amb.count).toBeGreaterThanOrEqual(MOTE_CAP - 6);
    expect(amb.count).toBeLessThanOrEqual(MOTE_CAP);
    expect(liveSlots(findPoints(scene)).length).toBe(amb.count);
  });

  it('day caps at ~60% of the pool so daylight feels airier', () => {
    const amb = new Ambience(new THREE.Scene(), rngFromSeed('ambience', 'day'));
    expect(DAY_CAP).toBe(Math.round(MOTE_CAP * 0.6));
    simulate(amb, 12, 'day');
    expect(amb.count).toBeLessThanOrEqual(DAY_CAP);
    expect(amb.count).toBeGreaterThanOrEqual(DAY_CAP - 4);
  });
});

describe('Ambience mode switching', () => {
  it('retints new motes while old ones live out their natural lives', () => {
    const scene = new THREE.Scene();
    const amb = new Ambience(scene, rngFromSeed('ambience', 'retint'));
    simulate(amb, 1, 'night');
    const nightCount = amb.count;
    expect(nightCount).toBeGreaterThan(4);
    const points = findPoints(scene);
    const colors = points.geometry.getAttribute('color').array;
    // Flicker scales all channels of a mote equally, so ordering is stable:
    // fireflies are green-dominant, embers red-dominant by a wide margin.
    const isFirefly = (i: number): boolean =>
      (colors[i * 3 + 1] ?? 0) > (colors[i * 3] ?? 0) &&
      (colors[i * 3] ?? 0) > (colors[i * 3 + 2] ?? 0);
    const isEmber = (i: number): boolean => (colors[i * 3] ?? 0) > (colors[i * 3 + 1] ?? 0) * 1.5;
    for (const i of liveSlots(points)) expect(isFirefly(i)).toBe(true);

    simulate(amb, 1, 'underworld'); // well under the 6 s minimum life
    const after = liveSlots(points);
    expect(amb.count).toBe(after.length);
    expect(amb.count).toBeGreaterThan(nightCount); // old + new coexist
    const fireflies = after.filter(isFirefly).length;
    const embers = after.filter(isEmber).length;
    expect(fireflies).toBe(nightCount); // mode flip cleared nothing
    expect(embers).toBe(after.length - fireflies); // every new mote is an ember
    expect(embers).toBeGreaterThan(0);
  });

  it('flickers live vertex colours over time on the per-mote phase', () => {
    const scene = new THREE.Scene();
    const amb = new Ambience(scene, rngFromSeed('ambience', 'flicker'));
    simulate(amb, 1, 'night');
    const points = findPoints(scene);
    const colorAttr = points.geometry.getAttribute('color');
    const slot = liveSlots(points)[0] ?? 0;
    const g0 = colorAttr.array[slot * 3 + 1] ?? 0;
    const v0 = colorAttr.version;
    expect(g0).toBeGreaterThan(0);
    simulate(amb, 0.4, 'night'); // a fraction of the ~2 s pulse period
    expect(colorAttr.array[slot * 3 + 1]).not.toBeCloseTo(g0, 3);
    // needsUpdate = true is flagged each update; in three that bumps version.
    expect(colorAttr.version).toBeGreaterThan(v0);
  });
});

describe('Ambience culling and lifecycle', () => {
  it('culls motes left more than 26 m behind the player', () => {
    const scene = new THREE.Scene();
    const amb = new Ambience(scene, rngFromSeed('ambience', 'cull'));
    simulate(amb, 3, 'night');
    expect(amb.count).toBeGreaterThan(20);
    amb.update(DT, 500, 64, 500, 'night'); // teleport far away
    expect(amb.count).toBeLessThanOrEqual(1); // at most one fresh spawn survives
    const points = findPoints(scene);
    const pos = points.geometry.getAttribute('position').array;
    for (const i of liveSlots(points)) {
      const dx = (pos[i * 3] ?? 0) - 500;
      const dy = (pos[i * 3 + 1] ?? 0) - 64;
      const dz = (pos[i * 3 + 2] ?? 0) - 500;
      expect(Math.hypot(dx, dy, dz)).toBeLessThanOrEqual(26);
    }
  });

  it('a single step past max life expires the whole field into fresh spawns', () => {
    const scene = new THREE.Scene();
    const amb = new Ambience(scene, rngFromSeed('ambience', 'life'));
    simulate(amb, 12, 'day'); // steady field, sunk and drifted off spawn poses
    amb.update(20, 0, 64, 0, 'day'); // > max life (14 s): every mote expires
    expect(amb.count).toBe(DAY_CAP); // refilled entirely with fresh spawns...
    const points = findPoints(scene);
    const pos = points.geometry.getAttribute('position').array;
    for (const i of liveSlots(points)) {
      // ...which all still sit exactly on the spawn shell: horizontal ring
      // 6..18 m, vertical bias within ±4 m of the player. Aged survivors of
      // the 20 s step would have sunk far below it.
      const horizontal = Math.hypot(pos[i * 3] ?? 0, pos[i * 3 + 2] ?? 0);
      const dy = (pos[i * 3 + 1] ?? 0) - 64;
      expect(horizontal).toBeGreaterThanOrEqual(6 - 1e-3);
      expect(horizontal).toBeLessThanOrEqual(18 + 1e-3);
      expect(Math.abs(dy)).toBeLessThanOrEqual(4 + 1e-3);
    }
  });

  it('clear() empties the pool and the field repopulates afterwards', () => {
    const scene = new THREE.Scene();
    const amb = new Ambience(scene, rngFromSeed('ambience', 'clear'));
    simulate(amb, 2, 'underworld');
    expect(amb.count).toBeGreaterThan(10);
    amb.clear();
    expect(amb.count).toBe(0);
    expect(liveSlots(findPoints(scene)).length).toBe(0);
    simulate(amb, 1, 'day');
    expect(amb.count).toBeGreaterThan(0);
  });

  it('zero-dt update is a no-op and never NaNs positions', () => {
    const scene = new THREE.Scene();
    const amb = new Ambience(scene, rngFromSeed('ambience', 'zero'));
    simulate(amb, 1.5, 'night');
    const points = findPoints(scene);
    const pos = points.geometry.getAttribute('position').array;
    const before = Array.from(pos);
    const count = amb.count;
    amb.update(0, 0, 64, 0, 'night');
    expect(amb.count).toBe(count);
    expect(Array.from(pos)).toEqual(before);
    for (const v of before) expect(Number.isFinite(v)).toBe(true);
  });
});
