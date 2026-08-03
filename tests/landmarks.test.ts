/**
 * Landmark planters: the ruined watchtower and the ancient stone circle.
 */
import { describe, expect, it } from 'vitest';
import { tryPlantStoneCircle, tryPlantWatchtower } from '../src/world/worldgen';
import { blockIndex, CHUNK_SIZE, CHUNK_VOLUME } from '../src/world/chunk';
import { Block } from '../src/world/blocks';

function flatGrass(surfaceY: number): { data: Uint8Array; heights: Int32Array } {
  const data = new Uint8Array(CHUNK_VOLUME);
  const heights = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      heights[z * CHUNK_SIZE + x] = surfaceY;
      data[blockIndex(x, 0, z)] = Block.bedrock;
      for (let y = 1; y < surfaceY; y++) data[blockIndex(x, y, z)] = Block.dirt;
      data[blockIndex(x, surfaceY, z)] = Block.grass;
    }
  }
  return { data, heights };
}

describe('ruined watchtower', () => {
  it('raises a hollow shaft with steps, a deck, a chest and a lantern', () => {
    const { data, heights } = flatGrass(124);
    tryPlantWatchtower(data, heights, 0, 4, 4);
    const floorY = 125;
    expect(data[blockIndex(4, floorY + 2, 4)]).toBe(Block.cobblestone); // wall
    expect(data[blockIndex(6, floorY + 3, 6)]).toBe(Block.air); // hollow core
    expect(data[blockIndex(6, floorY + 1, 4)]).toBe(Block.air); // door gap
    // Somewhere above: the lookout chest and lantern.
    let chest = 0;
    let lantern = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] === Block.chest) chest++;
      else if (data[i] === Block.lantern) lantern++;
    }
    expect(chest).toBe(1);
    expect(lantern).toBe(1);
  });

  it('bails on unfit ground', () => {
    const { data, heights } = flatGrass(124);
    heights[6 * CHUNK_SIZE + 6] = 128; // spike inside the footprint
    const before = data.slice();
    tryPlantWatchtower(data, heights, 0, 4, 4);
    expect(data).toEqual(before);
  });
});

describe('ancient stone circle', () => {
  it('rings monoliths around a mossstone plinth with a crystal heart', () => {
    const { data, heights } = flatGrass(124);
    tryPlantStoneCircle(data, heights, 12345, 3, 3);
    const floorY = 125;
    expect(data[blockIndex(7, floorY, 7)]).toBe(Block.mossstone); // plinth centre
    expect(data[blockIndex(7, floorY + 1, 7)]).toBe(Block.crystal); // heart
    let monolith = 0;
    for (let i = 0; i < data.length; i++) if (data[i] === Block.cobblestone) monolith++;
    expect(monolith).toBeGreaterThanOrEqual(16); // 8 monoliths, 2-4 tall
  });
});
