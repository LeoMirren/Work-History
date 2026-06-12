import { describe, expect, it } from 'vitest';
import { canPlaceAt } from '../src/player/interaction';
import { blockIntersectsBody, createBody } from '../src/player/physics';
import { Block } from '../src/world/blocks';

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
    expect(canPlaceAt(Block.air, 5, 128, 5, body)).toBe(false);
    expect(canPlaceAt(Block.air, 5, 127, 5, body)).toBe(true);
  });
});
