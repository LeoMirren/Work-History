import { describe, expect, it } from 'vitest';
import { Tiles, tileUVRect } from '../src/engine/atlas';
import { canPlaceAt, crackStageFor, crackUVsFor, hintForTarget } from '../src/player/interaction';
import { blockIntersectsBody, createBody } from '../src/player/physics';
import { Block } from '../src/world/blocks';
import { CHUNK_HEIGHT } from '../src/world/chunk';
import { Item } from '../src/world/items';

describe('placement rules (§4.8)', () => {
  const body = createBody(0.5, 10, 0.5); // AABB x[0.2,0.8] y[10,11.8] z[0.2,0.8]

  it('rejects placement intersecting the player AABB', () => {
    expect(blockIntersectsBody(0, 10, 0, body)).toBe(true);
    expect(canPlaceAt(Block.air, 0, 10, 0, body)).toBe(false);
    // Head cell also intersects.
    expect(canPlaceAt(Block.air, 0, 11, 0, body)).toBe(false);
  });

  it('allows placement flush against but not overlapping the player', () => {
    expect(blockIntersectsBody(1, 10, 0, body)).toBe(false); // x face flush at 1 > maxX 0.8
    expect(canPlaceAt(Block.air, 1, 10, 0, body)).toBe(true);
    expect(canPlaceAt(Block.air, 0, 12, 0, body)).toBe(true); // above head (top 11.8)
    expect(canPlaceAt(Block.air, 0, 9, 0, body)).toBe(true); // below feet
  });

  it('allows replacing only air and water', () => {
    expect(canPlaceAt(Block.air, 5, 10, 5, body)).toBe(true);
    expect(canPlaceAt(Block.water, 5, 10, 5, body)).toBe(true);
    expect(canPlaceAt(Block.stone, 5, 10, 5, body)).toBe(false);
    expect(canPlaceAt(Block.leaves, 5, 10, 5, body)).toBe(false);
  });

  it('rejects placement outside the world height', () => {
    expect(canPlaceAt(Block.air, 5, -1, 5, body)).toBe(false);
    expect(canPlaceAt(Block.air, 5, CHUNK_HEIGHT, 5, body)).toBe(false);
    expect(canPlaceAt(Block.air, 5, CHUNK_HEIGHT - 1, 5, body)).toBe(true);
  });
});

describe('crackStageFor (mining crack overlay)', () => {
  it('returns -1 (no overlay) when not breaking', () => {
    expect(crackStageFor(0)).toBe(-1);
    expect(crackStageFor(-0.25)).toBe(-1);
  });

  it('maps progress quarters to stages 0..3', () => {
    expect(crackStageFor(0.001)).toBe(0);
    expect(crackStageFor(0.249)).toBe(0);
    expect(crackStageFor(0.25)).toBe(1);
    expect(crackStageFor(0.499)).toBe(1);
    expect(crackStageFor(0.5)).toBe(2);
    expect(crackStageFor(0.75)).toBe(3);
    expect(crackStageFor(0.999)).toBe(3);
  });

  it('clamps overshoot to the last stage', () => {
    expect(crackStageFor(1)).toBe(3);
    expect(crackStageFor(1.5)).toBe(3);
  });
});

describe('hintForTarget (contextual crosshair hint)', () => {
  it('prioritises an aimed entity over any block target', () => {
    expect(hintForTarget(Block.chest, 0, true)).toBe('left-click: attack');
    expect(hintForTarget(Block.air, Item.hoe, true)).toBe('left-click: attack');
  });

  it('names the right-click action for interactive blocks', () => {
    expect(hintForTarget(Block.chest, 0, false)).toBe('right-click: open chest');
    expect(hintForTarget(Block.bed, 0, false)).toBe('right-click: sleep & set respawn');
    expect(hintForTarget(Block.riftframe, 0, false)).toBe('right-click: travel between realms');
    expect(hintForTarget(Block.furnace, 0, false)).toBe('open inventory (E) nearby to smelt');
    expect(hintForTarget(Block.cropRipe, 0, false)).toBe('left-click: harvest');
  });

  it('shows farming hints only with the matching item in hand', () => {
    expect(hintForTarget(Block.farmland, Item.seeds, false)).toBe('right-click: plant seeds');
    expect(hintForTarget(Block.farmland, 0, false)).toBeNull();
    expect(hintForTarget(Block.farmland, Item.hoe, false)).toBeNull();
    expect(hintForTarget(Block.grass, Item.hoe, false)).toBe('right-click: till farmland');
    expect(hintForTarget(Block.dirt, Item.hoe, false)).toBe('right-click: till farmland');
    expect(hintForTarget(Block.grass, Item.seeds, false)).toBeNull();
    expect(hintForTarget(Block.dirt, 0, false)).toBeNull();
  });

  it('stays silent for plain blocks, air and water', () => {
    expect(hintForTarget(Block.air, 0, false)).toBeNull();
    expect(hintForTarget(Block.stone, Item.hoe, false)).toBeNull();
    expect(hintForTarget(Block.water, Item.seeds, false)).toBeNull();
  });

  it('returns the identical string instance per frame (allocation-free)', () => {
    expect(hintForTarget(Block.chest, 0, false)).toBe(hintForTarget(Block.chest, 0, false));
  });
});

describe('crackUVsFor (crack overlay cube UVs)', () => {
  const CRACK_TILES = [Tiles.crack0, Tiles.crack1, Tiles.crack2, Tiles.crack3] as const;

  it('maps all six BoxGeometry faces to the same tile rect', () => {
    const uvs = crackUVsFor(Tiles.crack2);
    expect(uvs).toHaveLength(48); // 6 faces x 4 corners x (u,v)
    const r = tileUVRect(Tiles.crack2);
    for (let face = 0; face < 6; face++) {
      const o = face * 8;
      // BoxGeometry per-face corner order: (0,1) (1,1) (0,0) (1,0).
      expect(Array.from(uvs.slice(o, o + 8))).toEqual([r.u0, r.v1, r.u1, r.v1, r.u0, r.v0, r.u1, r.v0]);
    }
  });

  it('stays inside the unit UV square for every crack stage', () => {
    for (const tile of CRACK_TILES) {
      for (const v of crackUVsFor(tile)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives each stage a distinct tile rect', () => {
    const rects = new Set(CRACK_TILES.map((tile) => Array.from(crackUVsFor(tile).slice(0, 8)).join(',')));
    expect(rects.size).toBe(CRACK_TILES.length);
  });
});
