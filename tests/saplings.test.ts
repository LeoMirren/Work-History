/**
 * Saplings: shared tree-shape function, leaf bonus drop, and in-world growth.
 */
import { describe, expect, it } from 'vitest';
import { forEachTreeBlock } from '../src/world/worldgen';
import { bonusDropFor, Item } from '../src/world/items';
import { Block } from '../src/world/blocks';

describe('forEachTreeBlock', () => {
  it('emits a trunk of the requested height plus a leaf canopy', () => {
    let logs = 0;
    let leaves = 0;
    let maxLogDy = 0;
    forEachTreeBlock(5, (_dx, dy, _dz, id, isLog) => {
      if (isLog) {
        logs++;
        expect(id).toBe(Block.log);
        maxLogDy = Math.max(maxLogDy, dy);
      } else {
        leaves++;
        expect(id).toBe(Block.leaves);
      }
    });
    expect(logs).toBe(5); // trunk dy 1..5
    expect(maxLogDy).toBe(5);
    expect(leaves).toBeGreaterThan(logs); // canopy dwarfs the trunk
  });

  it('emits logs before any leaves (clean trunk under air-only fill)', () => {
    const order: boolean[] = [];
    forEachTreeBlock(4, (_dx, _dy, _dz, _id, isLog) => order.push(isLog));
    const firstLeaf = order.indexOf(false);
    const lastLog = order.lastIndexOf(true);
    expect(lastLog).toBeLessThan(firstLeaf);
  });
});

describe('bonusDropFor', () => {
  it('drops a sapling from leaves on a lucky roll only', () => {
    expect(bonusDropFor(Block.leaves, 0.05)).toEqual({ id: Item.sapling, count: 1 });
    expect(bonusDropFor(Block.leaves, 0.5)).toBeNull();
    expect(bonusDropFor(Block.stone, 0.01)).toBeNull(); // no bonus table entry
  });
});

/** A tiny in-memory voxel world for growth tests. */
function fakeWorld() {
  const map = new Map<string, number>();
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  return {
    set: (x: number, y: number, z: number, id: number) => map.set(key(x, y, z), id),
    getBlock: (x: number, y: number, z: number): number => map.get(key(x, y, z)) ?? Block.air,
    setBlock: (x: number, y: number, z: number, id: number): boolean => {
      map.set(key(x, y, z), id);
      return true;
    },
    count: (id: number): number => {
      let n = 0;
      for (const v of map.values()) if (v === id) n++;
      return n;
    },
  };
}

describe('growTree (in-world planting)', () => {
  it('grows a trunk and canopy into the air, sparing existing blocks', () => {
    // Lazy import to reuse the same module the game uses.
    return import('../src/player/interaction').then(({ growTree }) => {
      const w = fakeWorld();
      // A pre-existing stone block where a leaf would go must survive.
      w.set(1, 8, 0, Block.stone);
      growTree(w as never, 0, 1, 0, 5); // plant at (0,1,0), base grass at y=0
      expect(w.count(Block.log)).toBe(5);
      expect(w.count(Block.leaves)).toBeGreaterThan(5);
      expect(w.getBlock(1, 8, 0)).toBe(Block.stone); // not overwritten
      // Trunk column is logs from y=1..5.
      for (let y = 1; y <= 5; y++) expect(w.getBlock(0, y, 0)).toBe(Block.log);
    });
  });
});
