/**
 * Held-item viewmodel: the mini-cube UV pinning matches each block's real
 * per-face tiles in BoxGeometry's face order.
 */
import { describe, expect, it } from 'vitest';
import { blockCubeUVs } from '../src/player/viewmodel';
import { tileUVRect } from '../src/engine/atlas';
import { Block, FACE_TILES } from '../src/world/blocks';

describe('blockCubeUVs', () => {
  it('pins all six faces to the block-specific tiles (grass: side/top/bottom differ)', () => {
    const uvs = blockCubeUVs(Block.grass);
    expect(uvs.length).toBe(48);
    for (let f = 0; f < 6; f++) {
      const rect = tileUVRect(FACE_TILES[Block.grass * 6 + f] ?? 0);
      const o = f * 8;
      // Corners in BoxGeometry order: (0,1) (1,1) (0,0) (1,0).
      expect(uvs[o]).toBeCloseTo(rect.u0);
      expect(uvs[o + 1]).toBeCloseTo(rect.v1);
      expect(uvs[o + 2]).toBeCloseTo(rect.u1);
      expect(uvs[o + 3]).toBeCloseTo(rect.v1);
      expect(uvs[o + 4]).toBeCloseTo(rect.u0);
      expect(uvs[o + 5]).toBeCloseTo(rect.v0);
      expect(uvs[o + 6]).toBeCloseTo(rect.u1);
      expect(uvs[o + 7]).toBeCloseTo(rect.v0);
    }
    // Grass really does use distinct tiles: top (+y, face 2) != side (+x, face 0).
    const top = tileUVRect(FACE_TILES[Block.grass * 6 + 2] ?? 0);
    const side = tileUVRect(FACE_TILES[Block.grass * 6] ?? 0);
    expect(top.u0 !== side.u0 || top.v0 !== side.v0).toBe(true);
  });
});
