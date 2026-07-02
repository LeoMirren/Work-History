/**
 * Sky: palette math (day/night gradient stops, dawn ember), horizon fades,
 * seeded star field determinism, and scene-graph wiring — no DOM/WebGL.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Sky, horizonFade, skyColors, starOpacity, starVertices, STAR_COUNT } from '../src/engine/sky';

describe('skyColors', () => {
  it('full day: deep azure zenith over a pale horizon', () => {
    const { zenith, horizon } = skyColors(1);
    expect(zenith[2]).toBeGreaterThan(0.5); // blue-dominant
    expect(zenith[2]).toBeGreaterThan(zenith[0] * 2);
    for (const c of horizon) expect(c).toBeGreaterThan(0.55); // pale
    expect(horizon[2]).toBeGreaterThan(horizon[0]); // still cool, not amber
  });

  it('full night: near-black indigo zenith over faint slate', () => {
    const { zenith, horizon } = skyColors(0);
    for (const c of zenith) expect(c).toBeLessThan(0.06);
    expect(zenith[2]).toBeGreaterThan(zenith[0]); // indigo, not gray
    for (const c of horizon) expect(c).toBeLessThan(0.2);
  });

  it('clamps brightness outside 0..1', () => {
    expect(skyColors(-0.5)).toEqual(skyColors(0));
    expect(skyColors(1.5)).toEqual(skyColors(1));
  });

  it('warms the horizon only inside the dawn/dusk band', () => {
    const dawn = skyColors(0.4).horizon;
    expect(dawn[0]).toBeGreaterThan(dawn[2]); // amber: red over blue
    expect(dawn[0]).toBeGreaterThan(skyColors(0.15).horizon[0]);
    expect(dawn[0]).toBeGreaterThan(skyColors(0.95).horizon[0]);
    // Zenith stays cool through dawn.
    expect(skyColors(0.4).zenith[2]).toBeGreaterThan(skyColors(0.4).zenith[0]);
  });

  it('zenith brightens monotonically from night to day', () => {
    let prev = -1;
    for (let b = 0; b <= 1.001; b += 0.1) {
      const blue = skyColors(b).zenith[2];
      expect(blue).toBeGreaterThanOrEqual(prev);
      prev = blue;
    }
  });
});

describe('horizonFade / starOpacity', () => {
  it('bodies fade out just below the horizon and saturate above', () => {
    expect(horizonFade(-0.2)).toBe(0);
    expect(horizonFade(0.3)).toBe(1);
    expect(horizonFade(1)).toBe(1);
    const mid = horizonFade(0);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(horizonFade(0.05)).toBeGreaterThan(mid);
  });

  it('stars are (1 - brightness), clamped', () => {
    expect(starOpacity(0)).toBe(1);
    expect(starOpacity(1)).toBe(0);
    expect(starOpacity(0.18)).toBeCloseTo(0.82, 10);
    expect(starOpacity(-3)).toBe(1);
    expect(starOpacity(3)).toBe(0);
  });
});

describe('starVertices', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = starVertices('alpha', 64, 1);
    expect(starVertices('alpha', 64, 1)).toEqual(a);
    expect(starVertices('beta', 64, 1)).not.toEqual(a);
  });

  it('keeps every star on the upper hemisphere shell', () => {
    const radius = 0.96;
    const v = starVertices('gamma', STAR_COUNT, radius);
    expect(v.length).toBe(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const x = v[i * 3] ?? 0;
      const y = v[i * 3 + 1] ?? 0;
      const z = v[i * 3 + 2] ?? 0;
      expect(y).toBeGreaterThan(0);
      expect(Math.hypot(x, y, z)).toBeCloseTo(radius, 6);
    }
  });
});

describe('Sky scene graph', () => {
  it('names everything entity (dev shared-material assert whitelist)', () => {
    const scene = new THREE.Scene();
    new Sky(scene, 'voxelheim');
    let visited = 0;
    scene.traverse((obj) => {
      if (obj === scene) return;
      visited++;
      expect(obj.name).toBe('entity');
    });
    expect(visited).toBeGreaterThanOrEqual(6); // group, dome, stars, orbit, sun, moon
  });

  it('scales with setRadius and follows the player on x/z', () => {
    const scene = new THREE.Scene();
    const sky = new Sky(scene, 'voxelheim');
    sky.setRadius(184);
    sky.update(0.25, 1, 33, -7);
    const group = scene.children[0];
    expect(group?.scale.x).toBe(184);
    expect(group?.position.x).toBe(33);
    expect(group?.position.y).toBe(0);
    expect(group?.position.z).toBe(-7);
  });

  it('shows the sun at noon and the moon plus stars at midnight', () => {
    const scene = new THREE.Scene();
    const sky = new Sky(scene, 'voxelheim');
    let sun: THREE.Material | undefined;
    let moon: THREE.Material | undefined;
    let stars: THREE.Material | undefined;
    let starsObj: THREE.Points | undefined;
    scene.traverse((obj) => {
      if (obj instanceof THREE.Points) {
        stars = obj.material;
        starsObj = obj;
      } else if (obj instanceof THREE.Mesh) {
        if (obj.position.x > 0.5) sun = obj.material;
        if (obj.position.x < -0.5) moon = obj.material;
      }
    });
    sky.update(0.25, 1, 0, 0); // noon
    expect(sun?.opacity).toBe(1);
    expect(moon?.opacity).toBe(0);
    expect(stars?.opacity).toBe(0);
    expect(starsObj?.visible).toBe(false);
    sky.update(0.75, 0.18, 0, 0); // midnight at the brightness floor
    expect(sun?.opacity).toBe(0);
    expect(moon?.opacity).toBeGreaterThan(0.8);
    expect(stars?.opacity).toBeCloseTo(0.82, 6);
    expect(starsObj?.visible).toBe(true);
  });
});
