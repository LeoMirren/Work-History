import { describe, expect, it } from 'vitest';
import { raycast, type BlockQuery, type RaycastHit } from '../src/world/raycast';

const targetable = (id: number): boolean => id === 1;

function newHit(): RaycastHit {
  return { bx: 0, by: 0, bz: 0, nx: 0, ny: 0, nz: 0, distance: 0 };
}

function singleBlock(bx: number, by: number, bz: number): BlockQuery {
  return (x, y, z) => (x === bx && y === by && z === bz ? 1 : 0);
}

describe('voxel DDA raycast', () => {
  it('hits an axis-aligned block with the entry-face normal', () => {
    const hit = newHit();
    const found = raycast(singleBlock(5, 0, 0), targetable, 0.5, 0.5, 0.5, 1, 0, 0, 8, hit);
    expect(found).toBe(true);
    expect([hit.bx, hit.by, hit.bz]).toEqual([5, 0, 0]);
    expect([hit.nx, hit.ny, hit.nz]).toEqual([-1, 0, 0]);
    expect(hit.distance).toBeCloseTo(4.5, 10);
  });

  it('reports correct normals for all six approach directions', () => {
    const hit = newHit();
    const cases: Array<{ dir: [number, number, number]; origin: [number, number, number]; normal: [number, number, number] }> = [
      { dir: [1, 0, 0], origin: [0.5, 0.5, 0.5], normal: [-1, 0, 0] },
      { dir: [-1, 0, 0], origin: [8.5, 0.5, 0.5], normal: [1, 0, 0] },
      { dir: [0, 1, 0], origin: [4.5, -4.5, 0.5], normal: [0, -1, 0] },
      { dir: [0, -1, 0], origin: [4.5, 5.5, 0.5], normal: [0, 1, 0] },
      { dir: [0, 0, 1], origin: [4.5, 0.5, -4.5], normal: [0, 0, -1] },
      { dir: [0, 0, -1], origin: [4.5, 0.5, 5.5], normal: [0, 0, 1] },
    ];
    const block: BlockQuery = (x, y, z) => (x === 4 && y === 0 && z === 0 ? 1 : 0);
    for (const c of cases) {
      const found = raycast(block, targetable, ...c.origin, ...c.dir, 16, hit);
      expect(found).toBe(true);
      expect([hit.bx, hit.by, hit.bz]).toEqual([4, 0, 0]);
      expect([hit.nx, hit.ny, hit.nz]).toEqual(c.normal);
    }
  });

  it('hits along a diagonal, attributing the correct entry face', () => {
    const hit = newHit();
    const inv = Math.SQRT1_2;
    const found = raycast(singleBlock(4, 4, 0), targetable, 0.5, 0.5, 0.5, inv, inv, 0, 8, hit);
    expect(found).toBe(true);
    expect([hit.bx, hit.by, hit.bz]).toEqual([4, 4, 0]);
    // With equal tMax the X axis steps first, so the cell is entered via -Y.
    expect([hit.nx, hit.ny, hit.nz]).toEqual([0, -1, 0]);
  });

  it('misses when the block is beyond max distance', () => {
    const hit = newHit();
    expect(raycast(singleBlock(10, 0, 0), targetable, 0.5, 0.5, 0.5, 1, 0, 0, 5, hit)).toBe(false);
    expect(raycast(singleBlock(10, 0, 0), targetable, 0.5, 0.5, 0.5, 1, 0, 0, 11, hit)).toBe(true);
  });

  it('misses cleanly through empty space and ignores the starting voxel', () => {
    const hit = newHit();
    expect(raycast(() => 0, targetable, 0.5, 0.5, 0.5, 0.3, 0.8, -0.5, 50, hit)).toBe(false);
    // Standing inside a targetable block: the start cell is not reported.
    const all = raycast(() => 1, targetable, 0.5, 0.5, 0.5, 1, 0, 0, 5, hit);
    expect(all).toBe(true);
    expect(hit.bx).toBe(1);
  });

  it('handles negative origins and non-normalized directions', () => {
    const hit = newHit();
    const found = raycast(singleBlock(-3, -1, -7), targetable, -0.5, -0.5, -0.5, -5, -1, -13, 12, hit);
    expect(found).toBe(true);
    expect([hit.bx, hit.by, hit.bz]).toEqual([-3, -1, -7]);
  });
});
