/**
 * Pure, deterministic world generation. A Generator is created once per seed
 * (noise instances are reused across chunks); generateChunk(cx, cz) always
 * produces byte-identical output for the same seed.
 *
 * Terrain is climate-zoned: temperature/moisture noises classify each column
 * into a biome that drives its surface block, subsurface, tree density and a
 * height bias; a separate mountain noise raises dramatic ranges anywhere.
 */
import { type NoiseFunction2D, type NoiseFunction3D } from 'simplex-noise';
import { cyrb128, hash2, seededNoise2D, seededNoise3D } from './noise';
import { Block } from './blocks';
import { blockIndex, CHUNK_HEIGHT, CHUNK_SIZE, createChunkData } from './chunk';

export const SEA_LEVEL = 52;
const SNOW_LINE = 96; // surface block is snow above this height
const CAVE_THRESHOLD = 0.58;
const TUNNEL_WIDTH = 0.09; // spaghetti tunnels: both noises within this of zero
const ORE_THRESHOLD = 0.74; // 3D-noise ore pockets
const ORE_MIN_Y = 5;
const ORE_MAX_Y = 60;
const TREE_MARGIN = 2; // canopy margin: trees never cross chunk borders

export const Biome = {
  plains: 0,
  forest: 1,
  desert: 2,
  savanna: 3,
  snowy: 4,
} as const;

export type BiomeId = (typeof Biome)[keyof typeof Biome];

export function biomeName(id: number): string {
  switch (id) {
    case Biome.plains:
      return 'plains';
    case Biome.forest:
      return 'forest';
    case Biome.desert:
      return 'desert';
    case Biome.savanna:
      return 'savanna';
    case Biome.snowy:
      return 'snowy';
    default:
      return 'unknown';
  }
}

/** Per-biome surface, subsurface and 1-in-N tree chance (0 = none). */
interface BiomeDef {
  surface: number;
  subsurface: number;
  treeChanceDiv: number;
  /** Flat additive bias to terrain height. */
  heightBias: number;
}

const BIOME_DEFS: Record<number, BiomeDef> = {
  [Biome.plains]: { surface: Block.grass, subsurface: Block.dirt, treeChanceDiv: 64, heightBias: -2 },
  [Biome.forest]: { surface: Block.grass, subsurface: Block.dirt, treeChanceDiv: 14, heightBias: 0 },
  [Biome.desert]: { surface: Block.sand, subsurface: Block.sand, treeChanceDiv: 0, heightBias: -1 },
  [Biome.savanna]: { surface: Block.grass, subsurface: Block.dirt, treeChanceDiv: 110, heightBias: -1 },
  [Biome.snowy]: { surface: Block.snow, subsurface: Block.dirt, treeChanceDiv: 88, heightBias: 0 },
};

export interface Generator {
  readonly seed: string;
  heightAt(wx: number, wz: number): number;
  biomeAt(wx: number, wz: number): number;
  generateChunk(cx: number, cz: number): Uint8Array;
}

export function createGenerator(seed: string): Generator {
  const continental: NoiseFunction2D = seededNoise2D(seed, 'continental');
  const hillMask: NoiseFunction2D = seededNoise2D(seed, 'hillMask');
  const hills: NoiseFunction2D = seededNoise2D(seed, 'hills');
  const detail: NoiseFunction2D = seededNoise2D(seed, 'detail');
  const mountain: NoiseFunction2D = seededNoise2D(seed, 'mountain');
  const temperature: NoiseFunction2D = seededNoise2D(seed, 'temp');
  const moisture: NoiseFunction2D = seededNoise2D(seed, 'moisture');
  const cave: NoiseFunction3D = seededNoise3D(seed, 'cave');
  const tunnelA: NoiseFunction3D = seededNoise3D(seed, 'tunnelA');
  const tunnelB: NoiseFunction3D = seededNoise3D(seed, 'tunnelB');
  const ore: NoiseFunction3D = seededNoise3D(seed, 'ore');
  const treeSeed = cyrb128(`${seed} trees`)[0];

  function biomeAt(wx: number, wz: number): number {
    const t = temperature(wx / 620, wz / 620);
    const m = moisture(wx / 520, wz / 520);
    if (t > 0.45 && m < -0.05) return Biome.desert;
    if (t > 0.28 && m < 0.18) return Biome.savanna;
    if (t < -0.4) return Biome.snowy;
    if (m > 0.22) return Biome.forest;
    return Biome.plains;
  }

  function heightAt(wx: number, wz: number): number {
    const c = continental(wx / 512, wz / 512);
    const base = 50 + 22 * c;
    const mask = Math.max(0, hillMask(wx / 300, wz / 300));
    const hill = hills(wx / 96, wz / 96) * 14 * mask;
    const det = detail(wx / 24, wz / 24) * 3;
    // Mountain ranges: squared positive noise gives sharp, localized peaks.
    const m = Math.max(0, mountain(wx / 240, wz / 240));
    const mtn = m * m * 48;
    const bias = BIOME_DEFS[biomeAt(wx, wz)]?.heightBias ?? 0;
    const h = Math.round(base + hill + det + mtn + bias);
    return Math.min(120, Math.max(8, h));
  }

  /** Surface block for a column, honoring oceans/beaches and the snow line. */
  function surfaceBlockFor(h: number, biome: number): number {
    if (h < SEA_LEVEL) return Block.sand; // sea floor
    if (h >= SEA_LEVEL - 2 && h <= SEA_LEVEL + 1) return Block.sand; // beach
    if (h > SNOW_LINE) return Block.snow; // peaks
    return BIOME_DEFS[biome]?.surface ?? Block.grass;
  }

  function generateChunk(cx: number, cz: number): Uint8Array {
    const data = createChunkData();
    const heights = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
    const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);

    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = cx * CHUNK_SIZE + x;
        const wz = cz * CHUNK_SIZE + z;
        const biome = biomeAt(wx, wz);
        const h = heightAt(wx, wz);
        heights[z * CHUNK_SIZE + x] = h;
        biomes[z * CHUNK_SIZE + x] = biome;

        data[blockIndex(x, 0, z)] = Block.bedrock;
        // Beaches and deserts lay sand under the surface; else biome subsurface.
        const beach = h >= SEA_LEVEL - 2 && h <= SEA_LEVEL + 1;
        const subsurface = beach ? Block.sand : BIOME_DEFS[biome]?.subsurface ?? Block.dirt;
        for (let y = 1; y < h - 4; y++) data[blockIndex(x, y, z)] = Block.stone;
        // Ore veins replace stone in pockets where the 3D noise spikes.
        const oreTop = Math.min(ORE_MAX_Y, h - 5);
        for (let y = ORE_MIN_Y; y <= oreTop; y++) {
          if (ore(wx / 18, y / 18, wz / 18) > ORE_THRESHOLD) {
            data[blockIndex(x, y, z)] = Block.ore;
          }
        }
        for (let y = Math.max(1, h - 4); y < h; y++) data[blockIndex(x, y, z)] = subsurface;
        data[blockIndex(x, h, z)] = surfaceBlockFor(h, biome);

        if (h < SEA_LEVEL) {
          for (let y = h + 1; y <= SEA_LEVEL; y++) data[blockIndex(x, y, z)] = Block.water;
        }

        // Caves: never carve near/below sea level columns (keeps oceans full).
        // Two systems: "cheese" rooms (threshold) plus winding "spaghetti"
        // tunnels where two independent noises both pass near zero.
        if (h >= SEA_LEVEL + 2) {
          for (let y = 5; y <= h - 6; y++) {
            const room = cave(wx / 40, y / 28, wz / 40) > CAVE_THRESHOLD;
            const tunnel =
              !room &&
              Math.abs(tunnelA(wx / 70, y / 42, wz / 70)) < TUNNEL_WIDTH &&
              Math.abs(tunnelB(wx / 70, y / 42, wz / 70)) < TUNNEL_WIDTH;
            if (room || tunnel) data[blockIndex(x, y, z)] = Block.air;
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
        const div = BIOME_DEFS[biomes[z * CHUNK_SIZE + x] ?? Biome.plains]?.treeChanceDiv ?? 0;
        if (div === 0) continue;
        const hsh = hash2(treeSeed, cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z);
        if (hsh % div !== 0) continue;
        plantTree(data, x, z, h, 4 + ((hsh >>> 8) % 3));
      }
    }

    return data;
  }

  return { seed, heightAt, biomeAt, generateChunk };
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
