/**
 * Roaming titan anchors: the pure region locator behind the Stone Colossus.
 * Same contract as villageCenterFor — deterministic per (seed, region), a
 * bounded share of regions host one, and anchors keep a margin inside their
 * region so only the player's own region can ever be in engage range.
 */
import { describe, expect, it } from 'vitest';
import { titanAnchorFor, TITAN_CHANCE_PCT, TITAN_REGION_BLOCKS } from '../src/world/worldgen';

describe('titanAnchorFor', () => {
  it('is deterministic per (seed, region)', () => {
    const a = titanAnchorFor(12345, 3, -2);
    const b = titanAnchorFor(12345, 3, -2);
    expect(a).toEqual(b);
  });

  it('keeps every anchor at least 48 blocks inside its region', () => {
    for (let rx = -6; rx <= 6; rx++) {
      for (let rz = -6; rz <= 6; rz++) {
        const anchor = titanAnchorFor(999, rx, rz);
        if (!anchor) continue;
        expect(anchor.x - rx * TITAN_REGION_BLOCKS).toBeGreaterThanOrEqual(48);
        expect(anchor.x - rx * TITAN_REGION_BLOCKS).toBeLessThan(TITAN_REGION_BLOCKS - 48);
        expect(anchor.z - rz * TITAN_REGION_BLOCKS).toBeGreaterThanOrEqual(48);
        expect(anchor.z - rz * TITAN_REGION_BLOCKS).toBeLessThan(TITAN_REGION_BLOCKS - 48);
      }
    }
  });

  it('hosts a titan in roughly TITAN_CHANCE_PCT% of regions', () => {
    let hosted = 0;
    const total = 400;
    for (let i = 0; i < total; i++) {
      if (titanAnchorFor(777, i % 20, Math.floor(i / 20))) hosted++;
    }
    expect(hosted / total).toBeGreaterThan((TITAN_CHANCE_PCT - 15) / 100);
    expect(hosted / total).toBeLessThan((TITAN_CHANCE_PCT + 15) / 100);
  });

  it('different seeds lay the titans out differently', () => {
    let differs = false;
    for (let rx = 0; rx < 10 && !differs; rx++) {
      const a = titanAnchorFor(1, rx, 0);
      const b = titanAnchorFor(2, rx, 0);
      differs = JSON.stringify(a) !== JSON.stringify(b);
    }
    expect(differs).toBe(true);
  });
});
