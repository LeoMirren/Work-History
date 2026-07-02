/**
 * Schematic build keys: cardinal snapping, per-key target cells, and the
 * place/refuse/consume rules of BuildKeys.tryPlace in both game modes.
 */
import { describe, expect, it } from 'vitest';
import { Block } from '../src/world/blocks';
import { Item } from '../src/world/items';
import { Inventory } from '../src/player/inventory';
import { createBody } from '../src/player/physics';
import type { HotbarState } from '../src/player/interaction';
import { BuildKeys, buildTargetFor, cardinalOf, type BuildWorld } from '../src/player/buildkeys';

const HALF_PI = Math.PI / 2;

function fakeWorld(): BuildWorld & { cells: Map<string, number> } {
  const cells = new Map<string, number>();
  return {
    cells,
    getBlock: (x, y, z) => cells.get(`${x},${y},${z}`) ?? Block.air,
    setBlock: (x, y, z, id) => void cells.set(`${x},${y},${z}`, id),
  };
}

function creativeHotbar(blockId: number): HotbarState {
  return { creativeBlock: blockId, inventory: null, slot: 0 };
}

/** Survival hotbar with a single stack in slot 0. */
function survivalSetup(id: number, count: number): { hotbar: HotbarState; inventory: Inventory } {
  const inventory = new Inventory();
  inventory.add(id, count);
  return { hotbar: { creativeBlock: 0, inventory, slot: 0 }, inventory };
}

describe('cardinalOf', () => {
  it('maps the exact cardinals per the facing convention (forward = -sin,-cos)', () => {
    expect(cardinalOf(0)).toEqual({ dx: 0, dz: -1 });
    expect(cardinalOf(HALF_PI)).toEqual({ dx: -1, dz: 0 });
    expect(cardinalOf(-HALF_PI)).toEqual({ dx: 1, dz: 0 });
    expect(cardinalOf(Math.PI)).toEqual({ dx: 0, dz: 1 });
    expect(cardinalOf(-Math.PI)).toEqual({ dx: 0, dz: 1 });
  });

  it('snaps off-cardinal yaws to the nearest cardinal', () => {
    expect(cardinalOf(Math.PI / 6)).toEqual({ dx: 0, dz: -1 }); // 30°: still -Z
    expect(cardinalOf(Math.PI / 3)).toEqual({ dx: -1, dz: 0 }); // 60°: past 45°, -X
    expect(cardinalOf(-Math.PI / 6)).toEqual({ dx: 0, dz: -1 });
    expect(cardinalOf(-Math.PI / 3)).toEqual({ dx: 1, dz: 0 });
    expect(cardinalOf(Math.PI - 0.3)).toEqual({ dx: 0, dz: 1 });
    expect(cardinalOf(-Math.PI + 0.3)).toEqual({ dx: 0, dz: 1 });
  });

  it('exact 45° diagonals resolve to a single unit cardinal', () => {
    for (const yaw of [Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 4, (-3 * Math.PI) / 4]) {
      const { dx, dz } = cardinalOf(yaw);
      expect(Math.abs(dx) + Math.abs(dz)).toBe(1);
    }
  });
});

describe('buildTargetFor', () => {
  // Feet at (2.4, 10.7, -3.2) → feet cell (2, 10, -4).
  const [fx, fy, fz] = [2.4, 10.7, -3.2];

  it('offsets all six keys around the feet cell when facing -Z (yaw 0)', () => {
    expect(buildTargetFor('front', 0, fx, fy, fz)).toEqual({ x: 2, y: 10, z: -5 });
    expect(buildTargetFor('back', 0, fx, fy, fz)).toEqual({ x: 2, y: 10, z: -3 });
    expect(buildTargetFor('left', 0, fx, fy, fz)).toEqual({ x: 1, y: 10, z: -4 });
    expect(buildTargetFor('right', 0, fx, fy, fz)).toEqual({ x: 3, y: 10, z: -4 });
    // Vertical pair builds one out in FRONT, never inside the player column.
    expect(buildTargetFor('up', 0, fx, fy, fz)).toEqual({ x: 2, y: 11, z: -5 });
    expect(buildTargetFor('down', 0, fx, fy, fz)).toEqual({ x: 2, y: 9, z: -5 });
  });

  it('offsets all six keys when facing +X (yaw -π/2)', () => {
    expect(buildTargetFor('front', -HALF_PI, fx, fy, fz)).toEqual({ x: 3, y: 10, z: -4 });
    expect(buildTargetFor('back', -HALF_PI, fx, fy, fz)).toEqual({ x: 1, y: 10, z: -4 });
    expect(buildTargetFor('left', -HALF_PI, fx, fy, fz)).toEqual({ x: 2, y: 10, z: -5 });
    expect(buildTargetFor('right', -HALF_PI, fx, fy, fz)).toEqual({ x: 2, y: 10, z: -3 });
    expect(buildTargetFor('up', -HALF_PI, fx, fy, fz)).toEqual({ x: 3, y: 11, z: -4 });
    expect(buildTargetFor('down', -HALF_PI, fx, fy, fz)).toEqual({ x: 3, y: 9, z: -4 });
  });

  it('a wobbled yaw snaps to the same targets as the exact cardinal', () => {
    expect(buildTargetFor('front', -HALF_PI + 0.3, fx, fy, fz)).toEqual(
      buildTargetFor('front', -HALF_PI, fx, fy, fz),
    );
  });
});

describe('BuildKeys.tryPlace in creative', () => {
  it('places the picker block into the air cell ahead and returns its id', () => {
    const world = fakeWorld();
    const body = createBody(0.5, 10, 0.5); // feet cell (0,10,0)
    const build = new BuildKeys();
    expect(build.tryPlace('front', world, body, 0, creativeHotbar(Block.stone), 'creative')).toBe(Block.stone);
    expect(world.cells.get('0,10,-1')).toBe(Block.stone);
  });

  it('refuses an occupied cell and leaves it untouched', () => {
    const world = fakeWorld();
    world.cells.set('0,10,-1', Block.dirt);
    const body = createBody(0.5, 10, 0.5);
    const build = new BuildKeys();
    expect(build.tryPlace('front', world, body, 0, creativeHotbar(Block.stone), 'creative')).toBe(0);
    expect(world.cells.get('0,10,-1')).toBe(Block.dirt);
  });

  it('refuses a cell intersecting the player AABB', () => {
    const world = fakeWorld();
    // Feet straddle x=1: AABB x[0.65,1.25] overlaps the front cell (1,10,0).
    const body = createBody(0.95, 10, 0.5);
    const build = new BuildKeys();
    expect(build.tryPlace('front', world, body, -HALF_PI, creativeHotbar(Block.stone), 'creative')).toBe(0);
    expect(world.cells.size).toBe(0);
  });

  it("refuses below the world floor ('down' at feet y=0) and an empty picker", () => {
    const world = fakeWorld();
    const body = createBody(0.5, 0, 0.5);
    const build = new BuildKeys();
    expect(build.tryPlace('down', world, body, 0, creativeHotbar(Block.stone), 'creative')).toBe(0);
    expect(build.tryPlace('front', world, body, 0, creativeHotbar(0), 'creative')).toBe(0);
    expect(world.cells.size).toBe(0);
  });
});

describe('BuildKeys.tryPlace in survival', () => {
  it('places the held block and consumes exactly one item', () => {
    const world = fakeWorld();
    const body = createBody(0.5, 10, 0.5);
    const { hotbar, inventory } = survivalSetup(Block.planks, 2);
    const build = new BuildKeys();
    expect(build.tryPlace('right', world, body, 0, hotbar, 'survival')).toBe(Block.planks);
    expect(world.cells.get('1,10,0')).toBe(Block.planks);
    expect(inventory.countOf(Block.planks)).toBe(1);
  });

  it('draining the stack empties the slot; an empty slot then refuses', () => {
    const world = fakeWorld();
    const body = createBody(0.5, 10, 0.5);
    const { hotbar, inventory } = survivalSetup(Block.planks, 1);
    const build = new BuildKeys();
    expect(build.tryPlace('front', world, body, 0, hotbar, 'survival')).toBe(Block.planks);
    expect(inventory.slots[0]).toBeNull();
    expect(build.tryPlace('back', world, body, 0, hotbar, 'survival')).toBe(0);
    expect(world.cells.has('0,10,1')).toBe(false);
  });

  it('refuses a non-block item without consuming it', () => {
    const world = fakeWorld();
    const body = createBody(0.5, 10, 0.5);
    const { hotbar, inventory } = survivalSetup(Item.stick, 3);
    const build = new BuildKeys();
    expect(build.tryPlace('front', world, body, 0, hotbar, 'survival')).toBe(0);
    expect(inventory.countOf(Item.stick)).toBe(3);
    expect(world.cells.size).toBe(0);
  });

  it('a blocked target never consumes stock', () => {
    const world = fakeWorld();
    world.cells.set('0,10,-1', Block.stone);
    const body = createBody(0.5, 10, 0.5);
    const { hotbar, inventory } = survivalSetup(Block.planks, 2);
    const build = new BuildKeys();
    expect(build.tryPlace('front', world, body, 0, hotbar, 'survival')).toBe(0);
    expect(inventory.countOf(Block.planks)).toBe(2);
  });
});
