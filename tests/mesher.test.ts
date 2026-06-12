import { describe, expect, it } from 'vitest';
import { Block } from '../src/world/blocks';
import { blockIndex, createChunkData } from '../src/world/chunk';
import { FACES, meshChunk, padLoneChunk, PADDED_VOLUME, paddedIndex } from '../src/world/mesher';
import { createGenerator } from '../src/world/worldgen';

/** Padded buffer with air borders (an isolated chunk floating in vacuum). */
function padWithAir(data: Uint8Array): Uint8Array {
  const padded = new Uint8Array(PADDED_VOLUME);
  for (let y = 0; y < 128; y++) {
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        padded[paddedIndex(x + 1, y, z + 1)] = data[blockIndex(x, y, z)] ?? 0;
      }
    }
  }
  return padded;
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
    const out = meshChunk(padLoneChunk(data), 0, 0);
    expect(out.opaque).not.toBeNull();
    const tris = out.opaque!.indices.length / 3;
    console.log(`[M1 acceptance] terrain chunk triangles: ${tris}`);
    expect(tris).toBeGreaterThan(100);
    expect(tris).toBeLessThan(20000); // naive un-culled would be ~393k
  });
});
