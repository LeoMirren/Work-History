/**
 * Graphics pass: foliage tinting and the baked light attribute as seen in
 * actual mesh output (sky openness, sealed darkness, lantern glow).
 */
import { describe, expect, it } from 'vitest';
import { foliageTint, meshChunk, type MeshArrays } from '../src/world/mesher';
import { SNAP_VOLUME, snapIndex } from '../src/world/lighting';
import { Block } from '../src/world/blocks';

function snapshotWith(blocks: Array<[number, number, number, number]>): Uint8Array {
  const buf = new Uint8Array(SNAP_VOLUME);
  for (const [x, y, z, id] of blocks) buf[snapIndex(x + 16, y, z + 16)] = id;
  return buf;
}

/** Average a light channel (0 sky, 1 block) over the quad whose 4 vertices sit on plane y. */
function faceLightAt(mesh: MeshArrays, planeY: number, channel: 0 | 1): number {
  const { positions, lights } = mesh;
  for (let v = 0; v < positions.length / 3; v += 4) {
    let onPlane = true;
    for (let c = 0; c < 4; c++) {
      if (positions[(v + c) * 3 + 1] !== planeY) onPlane = false;
    }
    if (!onPlane) continue;
    let sum = 0;
    for (let c = 0; c < 4; c++) sum += lights[(v + c) * 2 + channel] ?? 0;
    return sum / 4;
  }
  throw new Error(`no quad on plane y=${planeY}`);
}

describe('foliage tint', () => {
  it('is deterministic and bounded', () => {
    const a = foliageTint(123, -456);
    expect(foliageTint(123, -456)).toEqual(a);
    expect(a.r).toBeGreaterThan(0.9);
    expect(a.r).toBeLessThan(1.1);
    expect(a.b).toBeGreaterThan(0.8);
    expect(a.b).toBeLessThan(1.1);
  });

  it('varies across the world and tints grass but never stone', () => {
    const tints = new Set<string>();
    for (let i = 0; i < 16; i++) {
      const t = foliageTint(i * 64, i * -32);
      tints.add(`${t.r.toFixed(4)},${t.b.toFixed(4)}`);
    }
    expect(tints.size).toBeGreaterThan(4);

    const grass = meshChunk(snapshotWith([[9, 10, 9, Block.grass]]), 7, -3).opaque!;
    let tinted = 0;
    for (let v = 0; v < grass.colors.length / 3; v++) {
      if (Math.abs((grass.colors[v * 3] ?? 0) - (grass.colors[v * 3 + 1] ?? 0)) > 1e-6) tinted++;
    }
    expect(tinted).toBeGreaterThan(0);

    const stone = meshChunk(snapshotWith([[9, 10, 9, Block.stone]]), 7, -3).opaque!;
    for (let v = 0; v < stone.colors.length / 3; v++) {
      expect(stone.colors[v * 3]).toBeCloseTo(stone.colors[v * 3 + 1] ?? -1, 6);
    }
  });
});

describe('baked light attribute', () => {
  it('open-sky top faces carry full sky light', () => {
    const mesh = meshChunk(snapshotWith([[8, 10, 8, Block.stone]]), 0, 0).opaque!;
    expect(faceLightAt(mesh, 11, 0)).toBeCloseTo(1, 5); // sky channel
    expect(faceLightAt(mesh, 11, 1)).toBe(0); // no block light anywhere
  });

  it('a sealed cavity is pitch dark, then a lantern lights it', () => {
    // Solid 16-wide slab from y=30..40 with one air pocket in the middle.
    const blocks: Array<[number, number, number, number]> = [];
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        for (let y = 30; y <= 40; y++) blocks.push([x, y, z, Block.stone]);
      }
    }
    const dark = blocks.filter(([x, y, z]) => !(x === 8 && y === 35 && z === 8));
    const darkMesh = meshChunk(snapshotWith(dark), 0, 0).opaque!;
    // The pocket floor (top face of the block below at y=35 plane).
    const pocketSky = (() => {
      // Find the quad at y=35 inside the pocket footprint.
      const { positions, lights } = darkMesh;
      for (let v = 0; v < positions.length / 3; v += 4) {
        let inside = true;
        for (let c = 0; c < 4; c++) {
          const px = positions[(v + c) * 3] ?? -1;
          const py = positions[(v + c) * 3 + 1] ?? -1;
          const pz = positions[(v + c) * 3 + 2] ?? -1;
          if (py !== 35 || px < 8 || px > 9 || pz < 8 || pz > 9) inside = false;
        }
        if (inside) {
          let sky = 0;
          let blk = 0;
          for (let c = 0; c < 4; c++) {
            sky += lights[(v + c) * 2] ?? 0;
            blk += lights[(v + c) * 2 + 1] ?? 0;
          }
          return { sky: sky / 4, blk: blk / 4 };
        }
      }
      throw new Error('pocket floor quad not found');
    })();
    expect(pocketSky.sky).toBe(0);
    expect(pocketSky.blk).toBe(0);

    // Same slab but the pocket holds a lantern one cell over.
    const lit = dark.concat([[9, 35, 8, 0]]); // carve a second cell
    const withLantern = lit
      .filter(([x, y, z]) => !(x === 9 && y === 35 && z === 8))
      .concat([[9, 35, 8, Block.lantern]]);
    const litMesh = meshChunk(snapshotWith(withLantern), 0, 0).opaque!;
    const { positions, lights } = litMesh;
    let found = false;
    for (let v = 0; v < positions.length / 3 && !found; v++) {
      const py = positions[v * 3 + 1] ?? -1;
      const blk = lights[v * 2 + 1] ?? 0;
      if (py >= 35 && py <= 36 && blk > 0.5) found = true;
    }
    expect(found).toBe(true);
  });
});
