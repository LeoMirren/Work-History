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

  describe('hash-varied wildwood shapes', () => {
    /** A canonical silhouette string for the tree grown from `hash`. */
    function shapeOf(hash: number, trunkHeight = 5): string {
      const cells: string[] = [];
      forEachTreeBlock(trunkHeight, (dx, dy, dz, _id, isLog) => cells.push(`${dx},${dy},${dz},${isLog ? 'L' : 'F'}`), hash);
      return cells.sort().join('|');
    }

    it('grows visibly different trees from different hashes', () => {
      const shapes = new Set<string>();
      for (let h = 0; h < 40; h++) shapes.add(shapeOf(h * 2654435761));
      expect(shapes.size).toBeGreaterThan(4); // a varied wood, not one cloned tree
    });

    it('is deterministic: the same hash always grows the same tree', () => {
      expect(shapeOf(12345)).toBe(shapeOf(12345));
    });

    it('keeps every cell within the chunk-border margin of 3', () => {
      for (let h = 0; h < 64; h++) {
        forEachTreeBlock(6, (dx, _dy, dz) => {
          expect(Math.abs(dx)).toBeLessThanOrEqual(3);
          expect(Math.abs(dz)).toBeLessThanOrEqual(3);
        }, h * 2654435761);
      }
    });

    it('still emits every log (trunk and limbs) before any leaf', () => {
      for (let h = 0; h < 32; h++) {
        const order: boolean[] = [];
        forEachTreeBlock(5, (_dx, _dy, _dz, _id, isLog) => order.push(isLog), h * 40503);
        expect(order.lastIndexOf(true)).toBeLessThan(order.indexOf(false));
      }
    });

    it('grows limbs off the trunk, not just a bare pole', () => {
      let withLimbs = 0;
      for (let h = 0; h < 24; h++) {
        let offAxisLogs = 0;
        forEachTreeBlock(5, (dx, _dy, dz, _id, isLog) => {
          if (isLog && (dx !== 0 || dz !== 0)) offAxisLogs++;
        }, h * 2654435761);
        if (offAxisLogs > 0) withLimbs++;
      }
      expect(withLimbs).toBe(24); // every varied tree carries at least one limb
    });
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
