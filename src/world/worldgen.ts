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
const ORE_MIN_Y = 5;
// Each ore: noise scale, threshold (higher = rarer), and max depth band.
const IRON_THRESHOLD = 0.74;
const IRON_MAX_Y = 60;
const COAL_THRESHOLD = 0.7; // common, shallow-to-deep
const COAL_MAX_Y = 90;
const COPPER_THRESHOLD = 0.78;
const COPPER_MAX_Y = 46;
const GOLD_THRESHOLD = 0.84; // rare, deep
const GOLD_MAX_Y = 28;
const TREE_MARGIN = 2; // canopy margin: trees never cross chunk borders
const GEODE_CHANCE = 16; // ~1 chunk in 16 hosts a geode
const GEODE_R = 4; // sphere radius; kept inside the chunk
const GEODE_MIN_Y = 8;
const GEODE_MAX_Y = 40;
const HUT_CHANCE = 240; // ~1 chunk in 240 hosts an outpost hut
const HUT_SIZE = 5; // 5x5 footprint, kept fully inside the chunk

export const Biome = {
  plains: 0,
  forest: 1,
  desert: 2,
  savanna: 3,
  snowy: 4,
  jungle: 5,
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
    case Biome.jungle:
      return 'jungle';
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
  [Biome.jungle]: { surface: Block.grass, subsurface: Block.dirt, treeChanceDiv: 8, heightBias: 1 },
};

export type Dimension = 'overworld' | 'underworld';

export interface Generator {
  readonly seed: string;
  readonly dimension: Dimension;
  heightAt(wx: number, wz: number): number;
  biomeAt(wx: number, wz: number): number;
  generateChunk(cx: number, cz: number): Uint8Array;
}

// Underworld: an enclosed cavern realm of ashstone lit by emberrock veins.
const UW_FLOOR = 4;
const UW_CEIL = 118;
const UW_CAVERN_THRESHOLD = 0.2; // |noise| below this carves open cavern
const UW_EMBER_THRESHOLD = 0.8;

export function createGenerator(seed: string, dimension: Dimension = 'overworld'): Generator {
  if (dimension === 'underworld') return createUnderworld(seed);
  return createOverworld(seed);
}

/**
 * Deterministic safe landing for a dimension portal: generate the column's
 * chunk and find a solid block with a 2-tall air gap above. Scans top-down
 * (overworld) or from the cavern band (underworld). Returns the feet Y.
 */
export function findSafeSpawnY(seed: string, dimension: Dimension, wx: number, wz: number): number {
  const gen = createGenerator(seed, dimension);
  const data = gen.generateChunk(Math.floor(wx / CHUNK_SIZE), Math.floor(wz / CHUNK_SIZE));
  const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const top = dimension === 'underworld' ? UW_CEIL - 1 : CHUNK_HEIGHT - 1;
  for (let y = top; y >= 1; y--) {
    const solid = data[blockIndex(lx, y, lz)] !== Block.air && data[blockIndex(lx, y, lz)] !== Block.water;
    const air1 = data[blockIndex(lx, y + 1, lz)] === Block.air;
    const air2 = (data[blockIndex(lx, y + 2, lz)] ?? Block.air) === Block.air;
    if (solid && air1 && air2) return y + 1;
  }
  return dimension === 'underworld' ? UW_FLOOR + 3 : 70;
}

function createUnderworld(seed: string): Generator {
  const cavern: NoiseFunction3D = seededNoise3D(seed, 'uw:cavern');
  const ember: NoiseFunction3D = seededNoise3D(seed, 'uw:ember');
  const roof: NoiseFunction3D = seededNoise3D(seed, 'uw:roof');

  function generateChunk(cx: number, cz: number): Uint8Array {
    const data = createChunkData();
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = cx * CHUNK_SIZE + x;
        const wz = cz * CHUNK_SIZE + z;
        // Bumpy floor/ceiling slabs of bedrock cap the realm.
        const floorTop = UW_FLOOR + Math.round((roof(wx / 60, 0, wz / 60) + 1) * 2);
        const ceilBot = UW_CEIL - Math.round((roof(wx / 60, 9, wz / 60) + 1) * 2);
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let id: number = Block.air;
          if (y <= 1 || y >= UW_CEIL) {
            id = Block.bedrock;
          } else if (y <= floorTop || y >= ceilBot) {
            id = Block.ashstone;
          } else {
            // Solid ashstone except where the cavern noise opens space.
            const open = Math.abs(cavern(wx / 34, y / 30, wz / 34)) < UW_CAVERN_THRESHOLD;
            if (!open) {
              id = ember(wx / 16, y / 16, wz / 16) > UW_EMBER_THRESHOLD ? Block.emberrock : Block.ashstone;
            }
          }
          if (id !== Block.air) data[blockIndex(x, y, z)] = id;
        }
      }
    }
    return data;
  }

  return {
    seed,
    dimension: 'underworld',
    heightAt: () => UW_FLOOR + 3,
    biomeAt: () => 0,
    generateChunk,
  };
}

function createOverworld(seed: string): Generator {
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
  const coalN: NoiseFunction3D = seededNoise3D(seed, 'coal');
  const copperN: NoiseFunction3D = seededNoise3D(seed, 'copper');
  const goldN: NoiseFunction3D = seededNoise3D(seed, 'gold');
  const treeSeed = cyrb128(`${seed} trees`)[0];
  const geodeSeed = cyrb128(`${seed} geodes`)[0];
  const hutSeed = cyrb128(`${seed} huts`)[0];

  function biomeAt(wx: number, wz: number): number {
    const t = temperature(wx / 620, wz / 620);
    const m = moisture(wx / 520, wz / 520);
    if (t > 0.45 && m < -0.05) return Biome.desert;
    if (t > 0.2 && m > 0.5) return Biome.jungle; // hot & very wet
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
        // Ore veins replace stone where the 3D noise spikes, by depth band.
        // Priority: rarer/deeper ores win the cell (gold > copper > iron > coal).
        const oreTop = Math.min(COAL_MAX_Y, h - 5);
        for (let y = ORE_MIN_Y; y <= oreTop; y++) {
          let placed = 0;
          if (y <= GOLD_MAX_Y && goldN(wx / 13, y / 13, wz / 13) > GOLD_THRESHOLD) {
            placed = Block.goldOre;
          } else if (y <= COPPER_MAX_Y && copperN(wx / 16, y / 16, wz / 16) > COPPER_THRESHOLD) {
            placed = Block.copperOre;
          } else if (y <= IRON_MAX_Y && ore(wx / 18, y / 18, wz / 18) > IRON_THRESHOLD) {
            placed = Block.ore;
          } else if (coalN(wx / 22, y / 22, wz / 22) > COAL_THRESHOLD) {
            placed = Block.coalOre;
          }
          if (placed !== 0) data[blockIndex(x, y, z)] = placed;
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
        const jungle = (biomes[z * CHUNK_SIZE + x] ?? Biome.plains) === Biome.jungle;
        const trunk = jungle ? 7 + ((hsh >>> 8) % 4) : 4 + ((hsh >>> 8) % 3);
        plantTree(data, x, z, h, trunk);
      }
    }

    // Geodes: rare hollow crystal pockets deep underground. One candidate per
    // chunk, kept fully inside the chunk so it never crosses a border.
    const ghash = hash2(geodeSeed, cx, cz);
    if (ghash % GEODE_CHANCE === 0) {
      const gx = GEODE_R + 1 + ((ghash >>> 4) % (CHUNK_SIZE - 2 * (GEODE_R + 1)));
      const gz = GEODE_R + 1 + ((ghash >>> 12) % (CHUNK_SIZE - 2 * (GEODE_R + 1)));
      const gy = GEODE_MIN_Y + ((ghash >>> 20) % (GEODE_MAX_Y - GEODE_MIN_Y));
      plantGeode(data, gx, gy, gz);
    }

    // Outpost huts: rare surface cabins on flat grassland (plains/savanna).
    // One candidate per chunk, kept inside the interior so it never crosses a
    // border, and only built where the 5x5 footprint is perfectly level.
    const hhash = hash2(hutSeed, cx, cz);
    if (hhash % HUT_CHANCE === 0) {
      const margin = 2;
      const span = CHUNK_SIZE - HUT_SIZE - 2 * margin;
      const x0 = margin + ((hhash >>> 4) % span);
      const z0 = margin + ((hhash >>> 12) % span);
      const biome = biomes[(z0 + 2) * CHUNK_SIZE + (x0 + 2)] ?? Biome.plains;
      if (biome === Biome.plains || biome === Biome.savanna) {
        tryPlantHut(data, heights, x0, z0);
      }
    }

    return data;
  }

  return { seed, dimension: 'overworld', heightAt, biomeAt, generateChunk };
}

/**
 * Carve a geode at local (gx, gy, gz): a hollow centre lined with crystal,
 * wrapped in a shell. Only overwrites solid non-bedrock cells, so it never
 * leaves floating shells where it meets a cavern.
 */
function plantGeode(data: Uint8Array, gx: number, gy: number, gz: number): void {
  const inner = GEODE_R - 1.6;
  const lining = GEODE_R - 0.5;
  const shell = GEODE_R + 0.7;
  for (let dy = -GEODE_R - 1; dy <= GEODE_R + 1; dy++) {
    const y = gy + dy;
    if (y < 1 || y >= CHUNK_HEIGHT) continue;
    for (let dz = -GEODE_R - 1; dz <= GEODE_R + 1; dz++) {
      for (let dx = -GEODE_R - 1; dx <= GEODE_R + 1; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > shell) continue;
        const i = blockIndex(gx + dx, y, gz + dz);
        const cur = data[i] ?? Block.air;
        if (d < inner) {
          if (cur !== Block.bedrock) data[i] = Block.air; // hollow centre
        } else if (cur !== Block.air && cur !== Block.bedrock) {
          data[i] = d < lining ? Block.crystal : Block.geodeshell;
        }
      }
    }
  }
}

/**
 * Build a small outpost hut on a flat 5x5 grass footprint at local (x0, z0).
 * Bails (leaving terrain untouched) unless every column under the footprint is
 * grass at the same height, so the cabin never floats or buries into a slope.
 * Cobblestone walls with a plank floor/roof, a door gap, a glass window, and a
 * lantern inside for light; an empty chest waits in the corner.
 */
export function tryPlantHut(data: Uint8Array, heights: Int32Array, x0: number, z0: number): void {
  const baseY = heights[z0 * CHUNK_SIZE + x0] ?? 0;
  if (baseY < SEA_LEVEL + 2 || baseY + 6 >= CHUNK_HEIGHT) return;
  // Flatness + grass check across the whole footprint.
  for (let dz = 0; dz < HUT_SIZE; dz++) {
    for (let dx = 0; dx < HUT_SIZE; dx++) {
      const x = x0 + dx;
      const z = z0 + dz;
      if ((heights[z * CHUNK_SIZE + x] ?? -1) !== baseY) return;
      if (data[blockIndex(x, baseY, z)] !== Block.grass) return;
    }
  }

  const floorY = baseY + 1;
  const wallTop = floorY + 3; // three-tall walls
  const last = HUT_SIZE - 1;
  for (let dz = 0; dz < HUT_SIZE; dz++) {
    for (let dx = 0; dx < HUT_SIZE; dx++) {
      const x = x0 + dx;
      const z = z0 + dz;
      data[blockIndex(x, floorY, z)] = Block.planks; // floor
      data[blockIndex(x, wallTop + 1, z)] = Block.planks; // roof
      const edge = dx === 0 || dz === 0 || dx === last || dz === last;
      for (let y = floorY + 1; y <= wallTop; y++) {
        data[blockIndex(x, y, z)] = edge ? Block.cobblestone : Block.air; // walls / interior
      }
    }
  }
  // Door: a 2-tall gap centred on the front (-z) wall.
  const doorX = x0 + (HUT_SIZE >> 1);
  data[blockIndex(doorX, floorY + 1, z0)] = Block.air;
  data[blockIndex(doorX, floorY + 2, z0)] = Block.air;
  // Window: a glass pane on the opposite wall.
  data[blockIndex(doorX, floorY + 2, z0 + last)] = Block.glass;
  // A lantern hung at the interior centre, and a chest in a corner.
  data[blockIndex(x0 + (HUT_SIZE >> 1), wallTop, z0 + (HUT_SIZE >> 1))] = Block.lantern;
  data[blockIndex(x0 + 1, floorY + 1, z0 + 1)] = Block.chest;
}

/**
 * Tree shape as offsets from the base (the grass surface). `emit` receives
 * dy>=1 cells with `isLog` marking the trunk. Logs are emitted before leaves
 * so a consumer that only fills air still forms a clean trunk. Shared by
 * worldgen and in-world sapling planting so both grow identical trees.
 */
export function forEachTreeBlock(
  trunkHeight: number,
  emit: (dx: number, dy: number, dz: number, id: number, isLog: boolean) => void,
): void {
  const top = trunkHeight;
  for (let t = 1; t <= trunkHeight; t++) emit(0, t, 0, Block.log, true);
  // 5x5x2 slab with corners removed, under the trunk top.
  for (const ly of [top - 2, top - 1]) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        emit(dx, ly, dz, Block.leaves, false);
      }
    }
  }
  // 3x3 layer at the trunk top.
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) emit(dx, top, dz, Block.leaves, false);
  }
  // Plus-shape cap.
  emit(0, top + 1, 0, Block.leaves, false);
  emit(-1, top + 1, 0, Block.leaves, false);
  emit(1, top + 1, 0, Block.leaves, false);
  emit(0, top + 1, -1, Block.leaves, false);
  emit(0, top + 1, 1, Block.leaves, false);
}

function plantTree(data: Uint8Array, x: number, z: number, h: number, trunkHeight: number): void {
  forEachTreeBlock(trunkHeight, (dx, dy, dz, id, isLog) => {
    const ly = h + dy;
    if (ly < 0 || ly >= CHUNK_HEIGHT) return;
    const i = blockIndex(x + dx, ly, z + dz);
    if (isLog) data[i] = id;
    else if (data[i] === Block.air) data[i] = id; // leaves never overwrite
  });
}
