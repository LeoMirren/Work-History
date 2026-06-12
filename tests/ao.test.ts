/**
 * §4.6 vertex AO: the calculator against hand-computed cases, plus the AO,
 * face-shade and quad-flip behavior as observed in actual mesh output.
 */
import { describe, expect, it } from 'vitest';
import { AO_BRIGHTNESS, computeAO, depthBrightness, FACE_SHADE, meshChunk, PADDED_VOLUME, paddedIndex } from '../src/world/mesher';
import { Block } from '../src/world/blocks';

describe('computeAO hand cases', () => {
  it('matches the spec formula', () => {
    expect(computeAO(false, false, false)).toBe(3);
    expect(computeAO(true, false, false)).toBe(2);
    expect(computeAO(false, true, false)).toBe(2);
    expect(computeAO(false, false, true)).toBe(2);
    expect(computeAO(true, false, true)).toBe(1);
    expect(computeAO(false, true, true)).toBe(1);
    // Both sides occluded: full corner darkness regardless of the diagonal.
    expect(computeAO(true, true, false)).toBe(0);
    expect(computeAO(true, true, true)).toBe(0);
  });

  it('uses the spec brightness LUT', () => {
    expect(AO_BRIGHTNESS).toEqual([0.5, 0.7, 0.85, 1.0]);
  });
});

/** Padded buffer with the given blocks set (px = x+1 etc.). */
function padded(blocks: Array<[number, number, number, number]>): Uint8Array {
  const buf = new Uint8Array(PADDED_VOLUME);
  for (const [x, y, z, id] of blocks) buf[paddedIndex(x + 1, y, z + 1)] = id;
  return buf;
}

/** Vertex colors of the +Y face of the block at (bx,by,bz), keyed by corner. */
function topFaceColors(
  buf: Uint8Array,
  bx: number,
  by: number,
  bz: number,
): Map<string, number> {
  const mesh = meshChunk(buf, 0, 0).opaque;
  expect(mesh).not.toBeNull();
  const { positions, colors } = mesh!;
  const out = new Map<string, number>();
  // The top face is the quad whose four vertices all lie on the y=by+1 plane
  // inside the block footprint (side faces only touch it with two vertices).
  for (let v = 0; v < positions.length / 3; v += 4) {
    let isTopQuad = true;
    for (let c = 0; c < 4; c++) {
      const x = positions[(v + c) * 3] ?? -1;
      const y = positions[(v + c) * 3 + 1] ?? -1;
      const z = positions[(v + c) * 3 + 2] ?? -1;
      if (y !== by + 1 || x < bx || x > bx + 1 || z < bz || z > bz + 1) {
        isTopQuad = false;
        break;
      }
    }
    if (!isTopQuad) continue;
    for (let c = 0; c < 4; c++) {
      const x = positions[(v + c) * 3] ?? 0;
      const z = positions[(v + c) * 3 + 2] ?? 0;
      out.set(`${x - bx},${z - bz}`, colors[(v + c) * 3] ?? -1);
    }
    return out;
  }
  throw new Error('top face not found');
}

describe('AO in mesh output (hand-computed)', () => {
  it('an unoccluded top face is fully lit', () => {
    const colors = topFaceColors(padded([[8, 10, 8, Block.stone]]), 8, 10, 8);
    expect(colors.size).toBe(4);
    for (const c of colors.values()) expect(c).toBeCloseTo(1.0, 6);
  });

  it('a side occluder darkens exactly the two adjacent corners to level 2', () => {
    // Occluder at (9,11,8): side1 for the top-face corners at x=9.
    const buf = padded([
      [8, 10, 8, Block.stone],
      [9, 11, 8, Block.stone],
    ]);
    const colors = topFaceColors(buf, 8, 10, 8);
    expect(colors.get('0,0')).toBeCloseTo(1.0, 6);
    expect(colors.get('0,1')).toBeCloseTo(1.0, 6);
    expect(colors.get('1,0')).toBeCloseTo(0.85, 6); // ao 2
    expect(colors.get('1,1')).toBeCloseTo(0.85, 6); // ao 2
  });

  it('two sides meeting at a corner give ao 0 there', () => {
    const buf = padded([
      [8, 10, 8, Block.stone],
      [7, 11, 8, Block.stone], // -x side
      [8, 11, 7, Block.stone], // -z side
    ]);
    const colors = topFaceColors(buf, 8, 10, 8);
    expect(colors.get('0,0')).toBeCloseTo(0.5, 6); // ao 0 corner
    expect(colors.get('1,0')).toBeCloseTo(0.85, 6); // ao 2 (one side)
    expect(colors.get('0,1')).toBeCloseTo(0.85, 6); // ao 2 (one side)
    expect(colors.get('1,1')).toBeCloseTo(1.0, 6); // untouched
  });

  it('a diagonal-only occluder darkens one corner to level 2', () => {
    const buf = padded([
      [8, 10, 8, Block.stone],
      [7, 11, 7, Block.stone], // diagonal above the (0,0) corner
    ]);
    const colors = topFaceColors(buf, 8, 10, 8);
    expect(colors.get('0,0')).toBeCloseTo(0.85, 6);
    expect(colors.get('1,1')).toBeCloseTo(1.0, 6);
  });

  it('non-opaque blocks (water, leaves, glass) never occlude', () => {
    const buf = padded([
      [8, 10, 8, Block.stone],
      [9, 11, 8, Block.water],
      [7, 11, 8, Block.leaves],
      [8, 11, 7, Block.glass],
    ]);
    const colors = topFaceColors(buf, 8, 10, 8);
    for (const c of colors.values()) expect(c).toBeCloseTo(1.0, 6);
  });

  it('flips the quad diagonal when ao0+ao2 > ao1+ao3', () => {
    // Diagonal occluders above the v1 (0,1) and v3 (1,0) top-face corners
    // give ao [3,2,3,2]: 6 > 4 -> flipped triangulation (1,2,3)(1,3,0).
    const buf = padded([
      [8, 10, 8, Block.stone],
      [7, 11, 9, Block.stone],
      [9, 11, 7, Block.stone],
    ]);
    const mesh = meshChunk(buf, 0, 0).opaque!;
    // Locate the top face: 4 consecutive vertices on the y=11 plane.
    let base = -1;
    for (let v = 0; v < mesh.positions.length / 3; v += 4) {
      if (
        mesh.positions[v * 3 + 1] === 11 &&
        mesh.positions[(v + 1) * 3 + 1] === 11 &&
        mesh.positions[(v + 2) * 3 + 1] === 11 &&
        mesh.positions[(v + 3) * 3 + 1] === 11
      ) {
        base = v;
        break;
      }
    }
    expect(base).toBeGreaterThanOrEqual(0);
    const quadIndices: number[] = [];
    for (let i = 0; i < mesh.indices.length; i++) {
      const idx = mesh.indices[i] ?? 0;
      if (idx >= base && idx < base + 4) quadIndices.push(idx - base);
    }
    expect(quadIndices).toEqual([1, 2, 3, 1, 3, 0]);
  });

  it('an isotropically lit quad keeps the default diagonal', () => {
    const mesh = meshChunk(padded([[8, 10, 8, Block.stone]]), 0, 0).opaque!;
    expect(Array.from(mesh.indices.slice(0, 6)).map((i) => i % 4)).toEqual([0, 1, 2, 0, 2, 3]);
  });
});

describe('face shading (§4.5)', () => {
  it('bakes the directional shade per face', () => {
    expect(FACE_SHADE).toEqual([0.75, 0.75, 1.0, 0.55, 0.85, 0.85]);
    const mesh = meshChunk(padded([[8, 10, 8, Block.stone]]), 0, 0).opaque!;
    // Lone block: faces emitted in table order (+x,-x,+y,-y,+z,-z), ao all 3.
    // The underside's air cell sits 1 below the block's own cover, so depth
    // lighting dims the -y face slightly.
    for (let f = 0; f < 6; f++) {
      const depth = f === 3 ? depthBrightness(1) : 1;
      for (let v = 0; v < 4; v++) {
        expect(mesh.colors[(f * 4 + v) * 3]).toBeCloseTo((FACE_SHADE[f] ?? -1) * depth, 6);
      }
    }
  });
});

describe('render passes (§4.5 culling rule)', () => {
  it('splits blocks into opaque/cutout/water passes', () => {
    const out = meshChunk(
      padded([
        [4, 10, 4, Block.stone],
        [8, 10, 8, Block.water],
        [12, 10, 12, Block.glass],
        [12, 14, 12, Block.leaves],
      ]),
      0,
      0,
    );
    expect(out.opaque!.indices.length).toBe(6 * 6);
    expect(out.water!.indices.length).toBe(6 * 6);
    expect(out.cutout!.indices.length).toBe(2 * 6 * 6); // glass + leaves
  });

  it('culls same-id non-opaque internal faces (water-water, glass-glass)', () => {
    const water = meshChunk(
      padded([
        [8, 10, 8, Block.water],
        [9, 10, 8, Block.water],
      ]),
      0,
      0,
    ).water!;
    expect(water.indices.length).toBe(10 * 6); // 12 faces minus the 2 shared

    const glass = meshChunk(
      padded([
        [8, 10, 8, Block.glass],
        [8, 11, 8, Block.glass],
      ]),
      0,
      0,
    ).cutout!;
    expect(glass.indices.length).toBe(10 * 6);
  });

  it('renders water against glass (different non-opaque ids)', () => {
    const out = meshChunk(
      padded([
        [8, 10, 8, Block.water],
        [9, 10, 8, Block.glass],
      ]),
      0,
      0,
    );
    expect(out.water!.indices.length).toBe(6 * 6); // all six water faces live
    expect(out.cutout!.indices.length).toBe(6 * 6);
  });

  it('culls non-opaque faces hidden by opaque neighbors', () => {
    const out = meshChunk(
      padded([
        [8, 10, 8, Block.water],
        [9, 10, 8, Block.stone],
      ]),
      0,
      0,
    );
    expect(out.water!.indices.length).toBe(5 * 6); // face against stone culled
    expect(out.opaque!.indices.length).toBe(6 * 6); // stone shows all faces
  });
});
