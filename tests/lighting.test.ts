/**
 * Light engine: sky column fill + BFS spread, block-light emitters, and
 * attenuation rules. All pure.
 */
import { describe, expect, it } from 'vitest';
import { computeLight, MAX_LIGHT, SNAP, SNAP_VOLUME, snapIndex } from '../src/world/lighting';
import { Block } from '../src/world/blocks';

function snapshot(blocks: Array<[number, number, number, number]> = []): Uint8Array {
  const buf = new Uint8Array(SNAP_VOLUME);
  for (const [x, y, z, id] of blocks) buf[snapIndex(x, y, z)] = id;
  return buf;
}

describe('sky light', () => {
  it('is full in open air and zero under solid cover', () => {
    const blocks: Array<[number, number, number, number]> = [];
    // A solid 5x5 roof at y=50 over (20..24, 20..24).
    for (let x = 20; x <= 24; x++) {
      for (let z = 20; z <= 24; z++) blocks.push([x, 50, z, Block.stone]);
    }
    const light = computeLight(snapshot(blocks));
    expect(light.sky[snapIndex(10, 80, 10)]).toBe(MAX_LIGHT); // open sky
    expect(light.sky[snapIndex(22, 60, 22)]).toBe(MAX_LIGHT); // above the roof
    // Directly under the roof center: only side-spill light, attenuated.
    const under = light.sky[snapIndex(22, 49, 22)] ?? 0;
    expect(under).toBeLessThan(MAX_LIGHT);
    expect(under).toBeGreaterThan(0); // spills in from the roof edge
  });

  it('goes fully dark inside a sealed box', () => {
    const blocks: Array<[number, number, number, number]> = [];
    // Hollow 3x3x3 stone box centered at (24, 40, 24).
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          blocks.push([24 + dx, 40 + dy, 24 + dz, Block.stone]);
        }
      }
    }
    const light = computeLight(snapshot(blocks));
    expect(light.sky[snapIndex(24, 40, 24)]).toBe(0);
    expect(light.block[snapIndex(24, 40, 24)]).toBe(0);
  });

  it('attenuates through water but keeps pouring down', () => {
    // A wide 11x11 pool, 4 deep, sampled under the CENTER so side-spill
    // through open air can't outshine the through-water path.
    const blocks: Array<[number, number, number, number]> = [];
    for (let x = 19; x <= 29; x++) {
      for (let z = 19; z <= 29; z++) {
        for (let y = 60; y < 64; y++) blocks.push([x, y, z, Block.water]);
      }
    }
    const light = computeLight(snapshot(blocks));
    const surface = light.sky[snapIndex(24, 63, 24)] ?? 0;
    const floor = light.sky[snapIndex(24, 59, 24)] ?? 0;
    expect(surface).toBeLessThan(MAX_LIGHT);
    expect(floor).toBeLessThan(surface);
    expect(floor).toBeGreaterThan(0);
  });
});

describe('block light', () => {
  it('radiates from a lantern with -1 per step', () => {
    const light = computeLight(snapshot([[24, 40, 24, Block.lantern]]));
    expect(light.block[snapIndex(24, 40, 24)]).toBe(14); // the emitter itself
    expect(light.block[snapIndex(25, 40, 24)]).toBe(13);
    expect(light.block[snapIndex(28, 40, 24)]).toBe(10);
    expect(light.block[snapIndex(24, 47, 24)]).toBe(7); // vertical too
    // 14 steps away: extinguished.
    expect(light.block[snapIndex(24 + 14, 40, 24)]).toBe(0);
  });

  it('is blocked by opaque walls but wraps around openings', () => {
    const blocks: Array<[number, number, number, number]> = [[20, 40, 24, Block.lantern]];
    // Wall at x=22 spanning a wide area, with a hole at z=28.
    for (let y = 30; y < 50; y++) {
      for (let z = 14; z < 34; z++) {
        if (!(y === 40 && z === 28)) blocks.push([22, y, z, Block.stone]);
      }
    }
    const light = computeLight(snapshot(blocks));
    const behindWall = light.block[snapIndex(23, 40, 24)] ?? 0;
    const directPath = light.block[snapIndex(21, 40, 24)] ?? 0;
    expect(directPath).toBe(13);
    // Behind the wall, light must detour through the hole at z=28 (longer path).
    expect(behindWall).toBeLessThan(directPath - 1);
  });

  it('lanterns light sealed rooms', () => {
    const blocks: Array<[number, number, number, number]> = [];
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) === 2) {
            blocks.push([24 + dx, 40 + dy, 24 + dz, Block.stone]);
          }
        }
      }
    }
    blocks.push([24, 39, 24, Block.lantern]); // on the floor inside
    const light = computeLight(snapshot(blocks));
    expect(light.sky[snapIndex(24, 40, 24)]).toBe(0);
    expect(light.block[snapIndex(24, 40, 24)]).toBe(13);
  });
});

describe('snapshot bounds', () => {
  it('clamps propagation to the snapshot without wrapping', () => {
    const light = computeLight(snapshot([[0, 40, 0, Block.lantern]]));
    expect(light.block[snapIndex(0, 40, 0)]).toBe(14);
    expect(light.block[snapIndex(SNAP - 1, 40, SNAP - 1)]).toBe(0);
  });
});
