/**
 * Pure, deterministic world generation (§4.4). A Generator is created once
 * per seed (noise instances are reused across chunks); generateChunk(cx, cz)
 * always produces byte-identical output for the same seed.
 */
import { type NoiseFunction2D, type NoiseFunction3D } from 'simplex-noise';
import { cyrb128, hash2, seededNoise2D, seededNoise3D } from './noise';
import { Block } from './blocks';
import { blockIndex, CHUNK_HEIGHT, CHUNK_SIZE, createChunkData } from './chunk';

export const SEA_LEVEL = 52;
const SNOW_LINE = 96; // surface block is snow above this height
const CAVE_THRESHOLD = 0.58;
const ORE_THRESHOLD = 0.74; // stretch §9: 3D-noise ore pockets
const ORE_MIN_Y = 5;
const ORE_MAX_Y = 60;
const TREE_CHANCE_DIV = 48; // 1-in-48 columns
const TREE_MARGIN = 2; // canopy margin: trees never cross chunk borders

export interface Generator {
  readonly seed: string;
  heightAt(wx: number, wz: number): number;
  generateChunk(cx: number, cz: number): Uint8Array;
}

export function createGenerator(seed: string): Generator {
  const continental: NoiseFunction2D = seededNoise2D(seed, 'continental');
  const hillMask: NoiseFunction2D = seededNoise2D(seed, 'hillMask');
  const hills: NoiseFunction2D = seededNoise2D(seed, 'hills');
  const detail: NoiseFunction2D = seededNoise2D(seed, 'detail');
  const cave: NoiseFunction3D = seededNoise3D(seed, 'cave');
  const ore: NoiseFunction3D = seededNoise3D(seed, 'ore');
  const treeSeed = cyrb128(`${seed} trees`)[0];

  function heightAt(wx: number, wz: number): number {
    const c = continental(wx / 512, wz / 512);
    const base = 50 + 22 * c;
    const mask = Math.max(0, hillMask(wx / 300, wz / 300));
    const h = Math.round(base + hills(wx / 96, wz / 96) * 14 * mask + detail(wx / 24, wz / 24) * 3);
    return Math.min(120, Math.max(8, h));
  }

  function surfaceBlockFor(h: number): number {
    if (h > SNOW_LINE) return Block.snow;
    if (h >= SEA_LEVEL + 2) return Block.grass;
    // Beach band [SEA-2, SEA+1] and every underwater floor (h < SEA) are sand.
    return Block.sand;
  }

  function generateChunk(cx: number, cz: number): Uint8Array {
    const data = createChunkData();
    const heights = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);

    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = cx * CHUNK_SIZE + x;
        const wz = cz * CHUNK_SIZE + z;
        const h = heightAt(wx, wz);
        heights[z * CHUNK_SIZE + x] = h;

        data[blockIndex(x, 0, z)] = Block.bedrock;
        // Beaches swap the dirt band under the surface for sand.
        const bandBlock = h >= SEA_LEVEL - 2 && h <= SEA_LEVEL + 1 ? Block.sand : Block.dirt;
        for (let y = 1; y < h - 4; y++) data[blockIndex(x, y, z)] = Block.stone;
        // Ore veins replace stone in pockets where the 3D noise spikes.
        const oreTop = Math.min(ORE_MAX_Y, h - 5);
        for (let y = ORE_MIN_Y; y <= oreTop; y++) {
          if (ore(wx / 18, y / 18, wz / 18) > ORE_THRESHOLD) {
            data[blockIndex(x, y, z)] = Block.ore;
          }
        }
        for (let y = Math.max(1, h - 4); y < h; y++) data[blockIndex(x, y, z)] = bandBlock;
        data[blockIndex(x, h, z)] = surfaceBlockFor(h);

        if (h < SEA_LEVEL) {
          for (let y = h + 1; y <= SEA_LEVEL; y++) data[blockIndex(x, y, z)] = Block.water;
        }

        // Caves: never carve near/below sea level columns (keeps oceans full).
        if (h >= SEA_LEVEL + 2) {
          for (let y = 5; y <= h - 6; y++) {
            if (cave(wx / 40, y / 28, wz / 40) > CAVE_THRESHOLD) {
              data[blockIndex(x, y, z)] = Block.air;
            }
          }
        }
      }
    }

    // Trees: per-column hash so placement is independent of iteration order.
    for (let z = TREE_MARGIN; z < CHUNK_SIZE - TREE_MARGIN; z++) {
      for (let x = TREE_MARGIN; x < CHUNK_SIZE - TREE_MARGIN; x++) {
        const h = heights[z * CHUNK_SIZE + x] ?? 0;
        if (h < SEA_LEVEL + 2) continue;
        if (data[blockIndex(x, h, z)] !== Block.grass) continue;
        const hsh = hash2(treeSeed, cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z);
        if (hsh % TREE_CHANCE_DIV !== 0) continue;
        plantTree(data, x, z, h, 4 + ((hsh >>> 8) % 3));
      }
    }

    return data;
  }

  return { seed, heightAt, generateChunk };
}

function plantTree(data: Uint8Array, x: number, z: number, h: number, trunkHeight: number): void {
  const placeLeaf = (lx: number, ly: number, lz: number): void => {
    if (ly >= CHUNK_HEIGHT) return;
    const i = blockIndex(lx, ly, lz);
    if (data[i] === Block.air) data[i] = Block.leaves; // leaves never overwrite logs/terrain
  };

  const top = h + trunkHeight;
  // 5x5x2 slab with corners removed, under the trunk top.
  for (const ly of [top - 2, top - 1]) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        placeLeaf(x + dx, ly, z + dz);
      }
    }
  }
  // 3x3 layer at the trunk top.
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) placeLeaf(x + dx, top, z + dz);
  }
  // Plus-shape cap.
  placeLeaf(x, top + 1, z);
  placeLeaf(x - 1, top + 1, z);
  placeLeaf(x + 1, top + 1, z);
  placeLeaf(x, top + 1, z - 1);
  placeLeaf(x, top + 1, z + 1);

  for (let t = 1; t <= trunkHeight; t++) {
    if (h + t < CHUNK_HEIGHT) data[blockIndex(x, h + t, z)] = Block.log;
  }
}
