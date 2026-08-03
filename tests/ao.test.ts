/**
 * §4.6 vertex AO: the calculator against hand-computed cases, plus the AO,
 * face-shade/grade and quad-flip behavior as observed in actual mesh output.
 */
import { describe, expect, it } from 'vitest';
import {
  AO_BRIGHTNESS,
  columnJitter,
  computeAO,
  FACE_GRADE_B,
  FACE_GRADE_RG,
  FACE_SHADE,
  meshChunk,
} from '../src/world/mesher';
import { SNAP_VOLUME, snapIndex } from '../src/world/lighting';
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

  it('uses the spec brightness LUT (darkest step deepened for contrast)', () => {
    expect(AO_BRIGHTNESS).toEqual([0.45, 0.7, 0.85, 1.0]);
  });
});

/**
 * All hand-case blocks sit at (8,10,8) in chunk (0,0) = world column (8,8).
 * The helper below reads the RED channel of the +y face, which carries
 * shade(1.0) × warm-top grade × the column's mineral jitter on top of AO —
 * fold those two deterministic factors into one expected-value multiplier.
 */
const TOP_STONE = (FACE_GRADE_RG[2] ?? 0) * columnJitter(Block.stone, 8, 8).r;

/** Snapshot with blocks placed in the meshed center chunk (offset 16). */
function padded(blocks: Array<[number, number, number, number]>): Uint8Array {
  const buf = new Uint8Array(SNAP_VOLUME);
  for (const [x, y, z, id] of blocks) buf[snapIndex(x + 16, y, z + 16)] = id;
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
  it('an unoccluded top face is fully lit (ao 1.0 → only grade × jitter)', () => {
    const colors = topFaceColors(padded([[8, 10, 8, Block.stone]]), 8, 10, 8);
    expect(colors.size).toBe(4);
    for (const c of colors.values()) expect(c).toBeCloseTo(1.0 * TOP_STONE, 6);
  });

  it('a side occluder darkens exactly the two adjacent corners to level 2', () => {
    // Occluder at (9,11,8): side1 for the top-face corners at x=9.
    const buf = padded([
      [8, 10, 8, Block.stone],
      [9, 11, 8, Block.stone],
    ]);
    const colors = topFaceColors(buf, 8, 10, 8);
    expect(colors.get('0,0')).toBeCloseTo(1.0 * TOP_STONE, 6);
    expect(colors.get('0,1')).toBeCloseTo(1.0 * TOP_STONE, 6);
    expect(colors.get('1,0')).toBeCloseTo(0.85 * TOP_STONE, 6); // ao 2
    expect(colors.get('1,1')).toBeCloseTo(0.85 * TOP_STONE, 6); // ao 2
  });

  it('two sides meeting at a corner give ao 0 there', () => {
    const buf = padded([
      [8, 10, 8, Block.stone],
      [7, 11, 8, Block.stone], // -x side
      [8, 11, 7, Block.stone], // -z side
    ]);
    const colors = topFaceColors(buf, 8, 10, 8);
    expect(colors.get('0,0')).toBeCloseTo(0.45 * TOP_STONE, 6); // ao 0 corner
    expect(colors.get('1,0')).toBeCloseTo(0.85 * TOP_STONE, 6); // ao 2 (one side)
    expect(colors.get('0,1')).toBeCloseTo(0.85 * TOP_STONE, 6); // ao 2 (one side)
    expect(colors.get('1,1')).toBeCloseTo(1.0 * TOP_STONE, 6); // untouched
  });

  it('a diagonal-only occluder darkens one corner to level 2', () => {
    const buf = padded([
      [8, 10, 8, Block.stone],
      [7, 11, 7, Block.stone], // diagonal above the (0,0) corner
    ]);
    const colors = topFaceColors(buf, 8, 10, 8);
    expect(colors.get('0,0')).toBeCloseTo(0.85 * TOP_STONE, 6);
    expect(colors.get('1,1')).toBeCloseTo(1.0 * TOP_STONE, 6);
  });

  it('non-opaque blocks (water, leaves, glass) never occlude', () => {
    const buf = padded([
      [8, 10, 8, Block.stone],
      [9, 11, 8, Block.water],
      [7, 11, 8, Block.leaves],
      [8, 11, 7, Block.glass],
    ]);
    const colors = topFaceColors(buf, 8, 10, 8);
    for (const c of colors.values()) expect(c).toBeCloseTo(1.0 * TOP_STONE, 6);
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

describe('face shading (§4.5) + warm/cool grade', () => {
  it('pins the shade and grade LUTs', () => {
    // Sides lowered (0.75→0.72, 0.85→0.82) so snowfields keep face contrast;
    // bottoms stay at the deepened 0.50.
    expect(FACE_SHADE).toEqual([0.72, 0.72, 1.0, 0.5, 0.82, 0.82]);
    // Warm tops (+3% red+green), cool east/west (+3% blue), n/s + bottoms neutral.
    expect(FACE_GRADE_RG).toEqual([1.0, 1.0, 1.03, 1.0, 1.0, 1.0]);
    expect(FACE_GRADE_B).toEqual([1.03, 1.03, 1.0, 1.0, 1.0, 1.0]);
  });

  it('bakes shade × grade × jitter per face', () => {
    const mesh = meshChunk(padded([[8, 10, 8, Block.stone]]), 0, 0).opaque!;
    const jit = columnJitter(Block.stone, 8, 8); // mineral: r === g === b
    // Lone block: faces emitted in table order (+x,-x,+y,-y,+z,-z), ao all 3.
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const shade = FACE_SHADE[f] ?? -1;
        const red = mesh.colors[(f * 4 + v) * 3];
        const green = mesh.colors[(f * 4 + v) * 3 + 1];
        const blue = mesh.colors[(f * 4 + v) * 3 + 2];
        expect(red).toBeCloseTo(shade * (FACE_GRADE_RG[f] ?? -1) * jit.r, 6);
        expect(green).toBe(red); // untinted: r === g exactly on every face
        expect(blue).toBeCloseTo(shade * (FACE_GRADE_B[f] ?? -1) * jit.b, 6);
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
