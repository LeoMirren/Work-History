import { describe, expect, it } from 'vitest';
import { Block } from '../src/world/blocks';
import { blockIndex, createChunkData } from '../src/world/chunk';
import { FACE_GRADE_RG, FACES, meshChunk, type MeshArrays } from '../src/world/mesher';
import { SNAP_VOLUME, snapIndex } from '../src/world/lighting';
import { createGenerator } from '../src/world/worldgen';

/** Snapshot with the chunk at center and air neighbors (floating island). */
function padWithAir(data: Uint8Array): Uint8Array {
  const snapshot = new Uint8Array(SNAP_VOLUME);
  for (let y = 0; y < 128; y++) {
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        snapshot[snapIndex(x + 16, y, z + 16)] = data[blockIndex(x, y, z)] ?? 0;
      }
    }
  }
  return snapshot;
}

describe('mesher', () => {
  it('emits 6 faces (12 triangles) for a lone block', () => {
    const data = createChunkData();
    data[blockIndex(8, 50, 8)] = Block.stone;
    const out = meshChunk(padWithAir(data), 0, 0);
    expect(out.opaque).not.toBeNull();
    expect(out.opaque!.indices.length).toBe(6 * 6);
    expect(out.opaque!.positions.length).toBe(6 * 4 * 3);
  });

  it('culls internal faces between touching opaque blocks', () => {
    const data = createChunkData();
    data[blockIndex(8, 50, 8)] = Block.stone;
    data[blockIndex(9, 50, 8)] = Block.dirt;
    const out = meshChunk(padWithAir(data), 0, 0);
    // 2 cubes = 12 faces, minus the 2 shared ones.
    expect(out.opaque!.indices.length).toBe(10 * 6);
  });

  it('emits nothing for a fully buried block neighborhood', () => {
    const data = createChunkData();
    // 3x3x3 solid cube: only the outer shell may emit; the center block must not.
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) data[blockIndex(8 + dx, 50 + dy, 8 + dz)] = Block.stone;
    const out = meshChunk(padWithAir(data), 0, 0);
    // 27 cubes, shell shows 9 faces per side * 6 sides = 54 quads.
    expect(out.opaque!.indices.length).toBe(54 * 6);
  });

  it('emits opaque faces against non-opaque neighbors (water, glass, leaves)', () => {
    const data = createChunkData();
    data[blockIndex(8, 50, 8)] = Block.stone;
    data[blockIndex(9, 50, 8)] = Block.water;
    data[blockIndex(7, 50, 8)] = Block.glass;
    data[blockIndex(8, 51, 8)] = Block.leaves;
    const out = meshChunk(padWithAir(data), 0, 0);
    // The stone cube still shows all 6 faces; water/glass/leaves emit none in M1.
    const quads = out.opaque!.indices.length / 6;
    expect(quads).toBe(6);
  });

  it('winds triangles CCW from outside (cross product matches face normal)', () => {
    const data = createChunkData();
    data[blockIndex(8, 50, 8)] = Block.stone;
    const out = meshChunk(padWithAir(data), 0, 0);
    const { positions, indices } = out.opaque!;
    // Face f produced quad f (deterministic emission order for a lone block).
    for (let f = 0; f < 6; f++) {
      const face = FACES[f]!;
      for (let tri = 0; tri < 2; tri++) {
        const i0 = indices[f * 6 + tri * 3]! * 3;
        const i1 = indices[f * 6 + tri * 3 + 1]! * 3;
        const i2 = indices[f * 6 + tri * 3 + 2]! * 3;
        const ax = positions[i1]! - positions[i0]!;
        const ay = positions[i1 + 1]! - positions[i0 + 1]!;
        const az = positions[i1 + 2]! - positions[i0 + 2]!;
        const bx = positions[i2]! - positions[i0]!;
        const by = positions[i2 + 1]! - positions[i0 + 1]!;
        const bz = positions[i2 + 2]! - positions[i0 + 2]!;
        const nx = ay * bz - az * by;
        const ny = az * bx - ax * bz;
        const nz = ax * by - ay * bx;
        const dot = nx * face.dx + ny * face.dy + nz * face.dz;
        expect(dot).toBeGreaterThan(0);
      }
    }
  });

  it('keeps UVs within each face tile', () => {
    const data = createChunkData();
    data[blockIndex(8, 50, 8)] = Block.grass;
    const out = meshChunk(padWithAir(data), 0, 0);
    const { uvs } = out.opaque!;
    for (let i = 0; i < uvs.length; i++) {
      expect(uvs[i]).toBeGreaterThanOrEqual(0);
      expect(uvs[i]).toBeLessThanOrEqual(1);
    }
  });

  it('meshes a real terrain chunk to low thousands of triangles (culling works)', () => {
    const generator = createGenerator('voxelheim-m1');
    const data = generator.generateChunk(0, 0);
    // Air neighbors expose the chunk's side walls too; still far from ~393k.
    const out = meshChunk(padWithAir(data), 0, 0);
    expect(out.opaque).not.toBeNull();
    const tris = out.opaque!.indices.length / 3;
    console.log(`[M1 acceptance] terrain chunk triangles (with exposed sides): ${tris}`);
    expect(tris).toBeGreaterThan(100);
    expect(tris).toBeLessThan(40000); // naive un-culled would be ~393k
  });
});

describe('color grading & column jitter', () => {
  /** One 16×16 slab of `id` at y=10; its top faces sit on the y=11 plane. */
  function slab(id: number): Uint8Array {
    const data = createChunkData();
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) data[blockIndex(x, 10, z)] = id;
    }
    return padWithAir(data);
  }

  /** Collect a color channel over every quad lying fully on plane y (slab tops). */
  function planeChannel(mesh: MeshArrays, planeY: number, channel: 0 | 1 | 2): number[] {
    const out: number[] = [];
    const { positions, colors } = mesh;
    for (let v = 0; v < positions.length / 3; v += 4) {
      let onPlane = true;
      for (let c = 0; c < 4; c++) {
        if (positions[(v + c) * 3 + 1] !== planeY) onPlane = false;
      }
      if (!onPlane) continue;
      for (let c = 0; c < 4; c++) out.push(colors[(v + c) * 3 + channel] ?? -1);
    }
    return out;
  }

  it('is deterministic: identical inputs produce identical mesh bytes', () => {
    const generator = createGenerator('voxelheim-m1');
    const snap = padWithAir(generator.generateChunk(-2, 3)); // negative wx columns too
    const a = meshChunk(snap, -2, 3);
    const b = meshChunk(snap, -2, 3);
    for (const pass of ['opaque', 'cutout', 'water'] as const) {
      const pa = a[pass];
      const pb = b[pass];
      expect(pa === null).toBe(pb === null);
      if (!pa || !pb) continue;
      expect(pa.positions).toEqual(pb.positions);
      expect(pa.uvs).toEqual(pb.uvs);
      expect(pa.colors).toEqual(pb.colors);
      expect(pa.lights).toEqual(pb.lights);
      expect(pa.indices).toEqual(pb.indices);
    }
  });

  it('jitters stone tops per world column within ±2%, keeping r === g', () => {
    const mesh = meshChunk(slab(Block.stone), 0, 0).opaque!;
    const warm = FACE_GRADE_RG[2] ?? 0; // top faces carry the warm grade
    const reds = planeChannel(mesh, 11, 0);
    const greens = planeChannel(mesh, 11, 1);
    expect(reds.length).toBe(16 * 16 * 4);
    for (let i = 0; i < reds.length; i++) {
      expect(reds[i]! / warm).toBeGreaterThanOrEqual(0.98 - 1e-6);
      expect(reds[i]! / warm).toBeLessThanOrEqual(1.02 + 1e-6);
      expect(greens[i]).toBe(reds[i]); // mineral jitter is channel-uniform
    }
    expect(new Set(reds).size).toBeGreaterThan(4); // varies across columns
  });

  it('jitters water blue per world column within ±3%, red/green untouched', () => {
    const mesh = meshChunk(slab(Block.water), 0, 0).water!;
    const blues = planeChannel(mesh, 11, 2);
    for (const b of blues) {
      expect(b).toBeGreaterThanOrEqual(0.97 - 1e-6);
      expect(b).toBeLessThanOrEqual(1.03 + 1e-6);
    }
    expect(new Set(blues).size).toBeGreaterThan(4);
    // Red carries only the warm-top grade — no jitter on water's r/g.
    for (const r of planeChannel(mesh, 11, 0)) expect(r).toBeCloseTo(FACE_GRADE_RG[2] ?? 0, 6);
  });

  it('varies grass green per column within ±5%; planks stay perfectly uniform', () => {
    const grass = meshChunk(slab(Block.grass), 0, 0).opaque!;
    const warm = FACE_GRADE_RG[2] ?? 0;
    const greens = planeChannel(grass, 11, 1);
    for (const g of greens) {
      expect(g / warm).toBeGreaterThanOrEqual(0.95 - 1e-6);
      expect(g / warm).toBeLessThanOrEqual(1.05 + 1e-6);
    }
    expect(new Set(greens).size).toBeGreaterThan(4);

    const planks = meshChunk(slab(Block.planks), 0, 0).opaque!;
    expect(new Set(planeChannel(planks, 11, 0)).size).toBe(1); // no jitter class
    expect(new Set(planeChannel(planks, 11, 1)).size).toBe(1);
    expect(new Set(planeChannel(planks, 11, 2)).size).toBe(1);
  });
});
