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
import { cyrb128, hash2, rngFromSeed, seededNoise2D, seededNoise3D } from './noise';
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
const HUT_CHANCE = 320; // ~1 wilderness chunk in 320 hosts a lone outpost hut
const HUT_SIZE = 5; // 5x5 footprint, kept fully inside the chunk
const STRUCT_CHANCE = 120; // ~1 chunk in 120 rolls a biome landmark
const RUIN_SIZE = 6; // sunken desert ruin footprint
const DOME_R = 3; // snow dome radius (7x7 footprint)
const SHRINE_SIZE = 3; // overgrown shrine plinth
const REEF_CHANCE = 34; // ~1 deep ocean-floor column in 34 sprouts reef décor
const DUNGEON_CHANCE = 90; // ~1 chunk in 90 hides a buried dungeon
const DUNGEON_MIN_Y = 14; // hash-picked dungeon floor band
const DUNGEON_MAX_Y = 34;
// Dungeon footprint: room A shell (7 wide) + corridor (1 free column, its
// ends punched through both shared walls) + room B shell (6 wide) = 14
// columns by 7 deep. y extent is 6 cells (floor y0 .. ceiling y0+5).
const DUNGEON_W = 14;
const DUNGEON_D = 7;
const HAMLET_W = 12; // two hut footprints with a 2-column gap between them
const HAMLET_D = 8; // hut rows plus the well row south of them
/** Village grid: chunk space is partitioned into square regions this many chunks per side. */
export const VILLAGE_REGION = 6;
const VILLAGE_CHANCE_PCT = 45; // ~45% of regions host a village
// Village centre composite: a lamp-lit approach row, the hut, and the well
// east of it — hut(5) + gap(1) + well(3) columns by lamp(1) + gap(1) + hut(5)
// rows, placed with the hamlet's slim margin so it stays inside the chunk.
const VILLAGE_CENTRE_W = 9;
const VILLAGE_CENTRE_D = 7;
const LONGHOUSE_W = 8; // village hall footprint: 8 columns of plank walls...
const LONGHOUSE_D = 5; // ...by 5 rows, cobble pillars on the corners
const FARM_W = 6; // farm plot footprint: crop rows either side of the channel
const FARM_D = 5;
const LAMP_HEIGHT = 3; // cobblestone pillar height under a lamp post's lantern
const WELL_SIZE = 3; // well rim footprint
const VILLAGE_SITE_TRIES = 10; // flat-site candidates rolled per village piece

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

/**
 * Per-seed world shape: every seed rolls its own terrain personality —
 * landmass breadth, mountain drama, hill roll, tree richness and a climate
 * lean — so no two worlds feel structurally alike. Rolled once from the
 * seed's own PRNG stream; pure and deterministic. Ranges stay moderate so
 * every world keeps oceans, beaches, all biomes and buildable flats.
 */
export interface WorldShape {
  /** Continental noise wavelength: 400..640 (smaller = choppier landmass). */
  readonly continentScale: number;
  /** Mountain amplitude: 34..64 (48 was the old fixed value). */
  readonly mountainAmp: number;
  /** Hill amplitude: 10..18. */
  readonly hillAmp: number;
  /** Global tree-density multiplier: 0.7..1.5. */
  readonly treeMul: number;
  /** Climate lean added to temperature noise: -0.12..0.12. */
  readonly tempBias: number;
  /** Wetness lean added to moisture noise: -0.1..0.1. */
  readonly moistBias: number;
}

export function worldShapeOf(seed: string): WorldShape {
  const rng = rngFromSeed(seed, 'worldshape');
  return {
    continentScale: 400 + Math.floor(rng() * 241),
    mountainAmp: 34 + Math.floor(rng() * 31),
    hillAmp: 10 + Math.floor(rng() * 9),
    treeMul: 0.7 + rng() * 0.8,
    tempBias: (rng() - 0.5) * 0.24,
    moistBias: (rng() - 0.5) * 0.2,
  };
}

/**
 * Locate the village hosted by region (rx, rz) of the VILLAGE_REGION-chunk
 * grid, or null if that region rolled none. Pure and stateless: everything
 * derives from hash2(seedInt, rx, rz), where seedInt is the world's village
 * seed, cyrb128(`${seed} villages`)[0]. About VILLAGE_CHANCE_PCT% of regions
 * host a village; the centre chunk sits 1..4 chunks in from the region
 * origin on each axis, so the full 3x3 block of member chunks (Chebyshev
 * distance <= 1 from the centre) never leaves the region. Any chunk can
 * therefore resolve its own village membership from its region alone —
 * zero cross-chunk data flow. Exported for tests and future NPC spawning.
 */
export function villageCenterFor(
  seedInt: number,
  rx: number,
  rz: number,
): { cx: number; cz: number } | null {
  const h = hash2(seedInt, rx, rz);
  if (h % 100 >= VILLAGE_CHANCE_PCT) return null;
  return {
    cx: rx * VILLAGE_REGION + 1 + ((h >>> 8) % 4),
    cz: rz * VILLAGE_REGION + 1 + ((h >>> 16) % 4),
  };
}

function createOverworld(seed: string): Generator {
  const shape = worldShapeOf(seed);
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
  const structSeed = cyrb128(`${seed} structures`)[0];
  const reefSeed = cyrb128(`${seed} reef`)[0];
  const dungeonSeed = cyrb128(`${seed} dungeons`)[0];
  const villageSeed = cyrb128(`${seed} villages`)[0];

  function biomeAt(wx: number, wz: number): number {
    const t = temperature(wx / 620, wz / 620) + shape.tempBias;
    const m = moisture(wx / 520, wz / 520) + shape.moistBias;
    if (t > 0.45 && m < -0.05) return Biome.desert;
    if (t > 0.2 && m > 0.5) return Biome.jungle; // hot & very wet
    if (t > 0.28 && m < 0.18) return Biome.savanna;
    if (t < -0.4) return Biome.snowy;
    if (m > 0.22) return Biome.forest;
    return Biome.plains;
  }

  function heightAt(wx: number, wz: number): number {
    const c = continental(wx / shape.continentScale, wz / shape.continentScale);
    const base = 50 + 22 * c;
    const mask = Math.max(0, hillMask(wx / 300, wz / 300));
    const hill = hills(wx / 96, wz / 96) * shape.hillAmp * mask;
    const det = detail(wx / 24, wz / 24) * 3;
    // Mountain ranges: squared positive noise gives sharp, localized peaks.
    const m = Math.max(0, mountain(wx / 240, wz / 240));
    const mtn = m * m * shape.mountainAmp;
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
          // Reef décor: deep sandy floors sprout the odd seagrass tuft or a
          // short coral pillar. Rolled per column from its own hash stream,
          // always seated on sand and capped well below sea level, so every
          // piece stays inside this column (no cross-chunk risk).
          if (h < SEA_LEVEL - 3 && data[blockIndex(x, h, z)] === Block.sand) {
            const rhash = hash2(reefSeed, wx, wz);
            if (rhash % REEF_CHANCE === 0) {
              if ((rhash >>> 8) % 4 === 0) {
                const coral = ((rhash >>> 12) & 1) === 0 ? Block.coralRose : Block.coralTeal;
                data[blockIndex(x, h + 1, z)] = coral;
                if (((rhash >>> 16) & 1) === 1) data[blockIndex(x, h + 2, z)] = coral;
              } else {
                data[blockIndex(x, h + 1, z)] = Block.seagrass;
              }
            }
          }
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
        // The world shape's richness multiplier scales every biome's density.
        const scaledDiv = Math.max(2, Math.round(div / shape.treeMul));
        const hsh = hash2(treeSeed, cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z);
        if (hsh % scaledDiv !== 0) continue;
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

    // Villages: region-seeded multi-chunk settlements. Each VILLAGE_REGION-
    // sized cell of chunk space may host one village (see villageCenterFor);
    // the 3x3 block of chunks around its centre are members, and every
    // member builds only inside itself, so villages need no cross-chunk
    // data. A member builds only when its own chunk-centre biome is grassy
    // (plains/savanna) — a village straddling a biome border simply thins
    // out at the unfit edge — and each piece self-bails on rough ground
    // exactly like the lone planters, leaving that terrain untouched.
    const vc = villageCenterFor(villageSeed, Math.floor(cx / VILLAGE_REGION), Math.floor(cz / VILLAGE_REGION));
    let inVillage = false;
    if (vc !== null && Math.max(Math.abs(cx - vc.cx), Math.abs(cz - vc.cz)) <= 1) {
      const mid = CHUNK_SIZE >> 1;
      const cbiome = biomes[mid * CHUNK_SIZE + mid] ?? Biome.plains;
      if (cbiome === Biome.plains || cbiome === Biome.savanna) {
        inVillage = true;
        const vhash = hash2(villageSeed, cx, cz);
        if (cx === vc.cx && cz === vc.cz) {
          // Centre plaza: a lamp post lighting the approach, the hut two
          // rows behind it, and the well east of the hut. Prefer one flat
          // site for the whole composite (slim hamlet margin); when the
          // terrain refuses, each piece hunts its own smaller flat spot so
          // the village heart still materializes on rougher ground.
          const plaza = findFlatSite(data, heights, vhash, VILLAGE_CENTRE_W, VILLAGE_CENTRE_D, 1);
          if (plaza !== null) {
            tryPlantLampPost(data, heights, plaza[0] + 2, plaza[1]);
            tryPlantHut(data, heights, plaza[0], plaza[1] + 2);
            tryPlantWell(data, heights, plaza[0] + 6, plaza[1] + 3);
          } else {
            const taken: Rect[] = [];
            const hut = findFlatSite(data, heights, hash2(vhash, 1, 0), HUT_SIZE, HUT_SIZE, 2);
            if (hut !== null) {
              tryPlantHut(data, heights, hut[0], hut[1]);
              taken.push([hut[0], hut[1], HUT_SIZE, HUT_SIZE]);
            }
            const well = findFlatSite(data, heights, hash2(vhash, 2, 0), WELL_SIZE, WELL_SIZE, 2, taken);
            if (well !== null) {
              tryPlantWell(data, heights, well[0], well[1]);
              taken.push([well[0], well[1], WELL_SIZE, WELL_SIZE]);
            }
            const lamp = findFlatSite(data, heights, hash2(vhash, 3, 0), 1, 1, 2, taken);
            if (lamp !== null) tryPlantLampPost(data, heights, lamp[0], lamp[1]);
          }
        } else {
          // Ring chunks roll their building from the village stream:
          // hut 3 / long house 2 / farm 2 / lamp-post pair 1 / green 1.
          const roll = vhash % 9;
          if (roll < 3) {
            const site = findFlatSite(data, heights, vhash, HUT_SIZE, HUT_SIZE, 2);
            if (site !== null) tryPlantHut(data, heights, site[0], site[1]);
          } else if (roll < 5) {
            const site = findFlatSite(data, heights, vhash, LONGHOUSE_W, LONGHOUSE_D, 2);
            if (site !== null) tryPlantLongHouse(data, heights, site[0], site[1]);
          } else if (roll < 7) {
            const site = findFlatSite(data, heights, vhash, FARM_W, FARM_D, 2);
            if (site !== null) tryPlantFarm(data, heights, site[0], site[1]);
          } else if (roll < 8) {
            const a = findFlatSite(data, heights, hash2(vhash, 1, 0), 1, 1, 2);
            if (a !== null) tryPlantLampPost(data, heights, a[0], a[1]);
            const b = findFlatSite(data, heights, hash2(vhash, 2, 0), 1, 1, 2, a ? [[a[0], a[1], 1, 1]] : []);
            if (b !== null) tryPlantLampPost(data, heights, b[0], b[1]);
          }
          // roll 8: the village green — this member chunk stays open.
        }
      }
    }

    // Outpost huts: rare lone cabins on flat wilderness grassland (plains/
    // savanna) — village member chunks skip this roll so settlements stay
    // planned. One candidate per chunk, kept inside the interior so it never
    // crosses a border, and only built where the 5x5 footprint is perfectly
    // level. When the hash also passes a 1-in-3 bit test the chunk attempts
    // a hamlet (two huts and a well) instead; if the wider span cannot fit
    // inside the interior it falls back to the single hut.
    const hhash = hash2(hutSeed, cx, cz);
    if (!inVillage && hhash % HUT_CHANCE === 0) {
      let planted = false;
      if ((hhash >>> 20) % 3 === 0) {
        const m = 1; // hamlets are wide; a slimmer margin still keeps them inside
        const spanX = CHUNK_SIZE - HAMLET_W - 2 * m;
        const spanZ = CHUNK_SIZE - HAMLET_D - 2 * m;
        if (spanX >= 1 && spanZ >= 1) {
          const x0 = m + ((hhash >>> 4) % spanX);
          const z0 = m + ((hhash >>> 12) % spanZ);
          const biome = biomes[(z0 + 2) * CHUNK_SIZE + (x0 + 2)] ?? Biome.plains;
          if (biome === Biome.plains || biome === Biome.savanna) {
            tryPlantHamlet(data, heights, hhash, x0, z0);
            planted = true;
          }
        }
      }
      if (!planted) {
        const margin = 2;
        const span = CHUNK_SIZE - HUT_SIZE - 2 * margin;
        const x0 = margin + ((hhash >>> 4) % span);
        const z0 = margin + ((hhash >>> 12) % span);
        const biome = biomes[(z0 + 2) * CHUNK_SIZE + (x0 + 2)] ?? Biome.plains;
        if (biome === Biome.plains || biome === Biome.savanna) {
          tryPlantHut(data, heights, x0, z0);
        }
      }
    }

    // Biome landmarks: rarer structures keyed to the local biome — sunken
    // brick ruins in deserts, hollow snow domes in snowfields, and
    // crystal-topped shrines under jungle/forest canopies. Same rules as
    // huts: one candidate per chunk, kept inside the interior, bailing
    // unless the ground fits.
    const shash = hash2(structSeed, cx, cz);
    if (shash % STRUCT_CHANCE === 0) {
      const margin = 2;
      const originFor = (size: number): [number, number] => {
        const span = CHUNK_SIZE - size - 2 * margin;
        return [margin + ((shash >>> 4) % span), margin + ((shash >>> 12) % span)];
      };
      const mid = CHUNK_SIZE >> 1;
      const cbiome = biomes[mid * CHUNK_SIZE + mid] ?? Biome.plains;
      if (cbiome === Biome.desert) {
        const [x0, z0] = originFor(RUIN_SIZE);
        tryPlantRuin(data, heights, shash, x0, z0);
      } else if (cbiome === Biome.snowy) {
        const [x0, z0] = originFor(2 * DOME_R + 1);
        tryPlantSnowDome(data, heights, x0 + DOME_R, z0 + DOME_R);
      } else if (cbiome === Biome.jungle || cbiome === Biome.forest) {
        const [x0, z0] = originFor(SHRINE_SIZE);
        tryPlantShrine(data, heights, x0, z0);
      }
    }

    // Buried dungeons: rolled on their own seed stream, independent of the
    // surface-structure rolls, so they coexist with landmarks above. The
    // 14x7 footprint is kept fully inside the chunk; carving only proceeds
    // when every column over the footprint is dry land holding at least 8
    // blocks of cover above the complex, which keeps it buried and upholds
    // the "no openings under oceans" invariant of the cave carver.
    const dhash = hash2(dungeonSeed, cx, cz);
    if (dhash % DUNGEON_CHANCE === 0) {
      const m = 1;
      const spanX = Math.max(1, CHUNK_SIZE - DUNGEON_W - 2 * m);
      const spanZ = Math.max(1, CHUNK_SIZE - DUNGEON_D - 2 * m);
      const x0 = m + ((dhash >>> 4) % spanX);
      const z0 = m + ((dhash >>> 8) % spanZ);
      let minH = CHUNK_HEIGHT;
      for (let dz = 0; dz < DUNGEON_D; dz++) {
        for (let dx = 0; dx < DUNGEON_W; dx++) {
          minH = Math.min(minH, heights[(z0 + dz) * CHUNK_SIZE + (x0 + dx)] ?? 0);
        }
      }
      if (minH >= SEA_LEVEL + 2 && dungeonY(dhash) + 6 <= minH - 8) {
        tryCarveDungeon(data, dhash, x0, z0);
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
 * A sunken desert ruin: the broken brick shell of a small building half
 * swallowed by the sand. A brick floor sits at ground level, per-column wall
 * stubs (heights rolled from the chunk hash) ring the perimeter, and a chest
 * survives in one corner. Bails unless the footprint is near-flat sand.
 */
export function tryPlantRuin(
  data: Uint8Array,
  heights: Int32Array,
  hash: number,
  x0: number,
  z0: number,
): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (let dz = 0; dz < RUIN_SIZE; dz++) {
    for (let dx = 0; dx < RUIN_SIZE; dx++) {
      const h = heights[(z0 + dz) * CHUNK_SIZE + (x0 + dx)] ?? -1;
      if (h < 0 || data[blockIndex(x0 + dx, h, z0 + dz)] !== Block.sand) return;
      minY = Math.min(minY, h);
      maxY = Math.max(maxY, h);
    }
  }
  if (maxY - minY > 1) return; // ruins tolerate a one-block drift of sand
  if (minY < SEA_LEVEL + 2 || minY + 5 >= CHUNK_HEIGHT) return;

  const last = RUIN_SIZE - 1;
  for (let dz = 0; dz < RUIN_SIZE; dz++) {
    for (let dx = 0; dx < RUIN_SIZE; dx++) {
      const x = x0 + dx;
      const z = z0 + dz;
      data[blockIndex(x, minY, z)] = Block.brick; // sunken floor
      const edge = dx === 0 || dz === 0 || dx === last || dz === last;
      if (!edge) continue;
      const stub = hash2(hash, dx, dz) % 3; // broken walls, 0-2 tall
      for (let y = 1; y <= stub; y++) data[blockIndex(x, minY + y, z)] = Block.brick;
    }
  }
  data[blockIndex(x0 + 1, minY + 1, z0 + 1)] = Block.chest;
}

/**
 * A hollow snow dome shelter: a squashed hemispheric snow shell with a door
 * gap on the -z face and a lantern set into the ceiling. (sx, sz) is the
 * dome centre. Bails unless the 7x7 footprint is near-flat snow.
 */
export function tryPlantSnowDome(data: Uint8Array, heights: Int32Array, sx: number, sz: number): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (let dz = -DOME_R; dz <= DOME_R; dz++) {
    for (let dx = -DOME_R; dx <= DOME_R; dx++) {
      const h = heights[(sz + dz) * CHUNK_SIZE + (sx + dx)] ?? -1;
      if (h < 0 || data[blockIndex(sx + dx, h, sz + dz)] !== Block.snow) return;
      minY = Math.min(minY, h);
      maxY = Math.max(maxY, h);
    }
  }
  if (maxY - minY > 1) return;
  if (minY < SEA_LEVEL + 2 || minY + DOME_R + 2 >= CHUNK_HEIGHT) return;

  for (let dy = 0; dy <= DOME_R; dy++) {
    for (let dz = -DOME_R; dz <= DOME_R; dz++) {
      for (let dx = -DOME_R; dx <= DOME_R; dx++) {
        // 1.3 squashes the sphere vertically into a low dome profile.
        const d = Math.sqrt(dx * dx + dy * dy * 1.3 + dz * dz);
        if (d > DOME_R + 0.4) continue;
        const i = blockIndex(sx + dx, minY + 1 + dy, sz + dz);
        data[i] = d >= DOME_R - 0.9 ? Block.snow : Block.air;
      }
    }
  }
  // Door: a two-tall gap through the -z rim of the shell.
  data[blockIndex(sx, minY + 1, sz - DOME_R)] = Block.air;
  data[blockIndex(sx, minY + 2, sz - DOME_R)] = Block.air;
  // A lantern set into the ceiling cap keeps the shelter lit.
  data[blockIndex(sx, minY + DOME_R, sz)] = Block.lantern;
}

/**
 * An overgrown shrine: a 3x3 cobblestone plinth holding a two-block pillar
 * crowned with a glowing crystal, with creeping leaves on two corners.
 * Bails unless the 3x3 footprint is flat grass.
 */
export function tryPlantShrine(data: Uint8Array, heights: Int32Array, x0: number, z0: number): void {
  const base = heights[z0 * CHUNK_SIZE + x0] ?? -1;
  if (base < SEA_LEVEL + 2 || base + 5 >= CHUNK_HEIGHT) return;
  for (let dz = 0; dz < SHRINE_SIZE; dz++) {
    for (let dx = 0; dx < SHRINE_SIZE; dx++) {
      if ((heights[(z0 + dz) * CHUNK_SIZE + (x0 + dx)] ?? -1) !== base) return;
      if (data[blockIndex(x0 + dx, base, z0 + dz)] !== Block.grass) return;
    }
  }
  for (let dz = 0; dz < SHRINE_SIZE; dz++) {
    for (let dx = 0; dx < SHRINE_SIZE; dx++) {
      data[blockIndex(x0 + dx, base + 1, z0 + dz)] = Block.cobblestone;
    }
  }
  const px = x0 + 1;
  const pz = z0 + 1;
  data[blockIndex(px, base + 2, pz)] = Block.cobblestone;
  data[blockIndex(px, base + 3, pz)] = Block.cobblestone;
  data[blockIndex(px, base + 4, pz)] = Block.crystal;
  if (data[blockIndex(x0, base + 2, z0)] === Block.air) data[blockIndex(x0, base + 2, z0)] = Block.leaves;
  const fx = x0 + SHRINE_SIZE - 1;
  const fz = z0 + SHRINE_SIZE - 1;
  if (data[blockIndex(fx, base + 2, fz)] === Block.air) data[blockIndex(fx, base + 2, fz)] = Block.leaves;
}

/** Hash-picked dungeon floor height in [DUNGEON_MIN_Y, DUNGEON_MAX_Y]. */
function dungeonY(hash: number): number {
  return DUNGEON_MIN_Y + ((hash >>> 16) % (DUNGEON_MAX_Y - DUNGEON_MIN_Y + 1));
}

/**
 * Carve a buried two-room dungeon whose floor sits at a hash-picked depth:
 * room A (5x4x5 interior) and room B (4x3x4 interior) joined by a corridor
 * three cells long and two tall, punched through both shared walls. Floors
 * are brick; walls and ceilings cobblestone. Shell cells only replace solid
 * non-bedrock ground, so intersecting caves open into the rooms naturally.
 * Two emberrock blocks glow in opposite wall corners of room A, a chest
 * waits in room A's corner (the container system seeds loot on first open)
 * and a crystal glints on room B's floor. Bails (leaving the chunk
 * untouched) unless the ground one above the complex over both room centres
 * is solid, so the rooms never open to the sky. The footprint spans
 * DUNGEON_W x DUNGEON_D columns from (x0, z0), which must sit fully inside
 * the chunk.
 */
export function tryCarveDungeon(data: Uint8Array, hash: number, x0: number, z0: number): void {
  const y0 = dungeonY(hash);
  // Stay buried: probe the cells directly above the complex at each room
  // centre; open air there means the dungeon would breach the surface.
  const overA = data[blockIndex(x0 + 3, y0 + 6, z0 + 3)] ?? Block.air;
  const overB = data[blockIndex(x0 + 11, y0 + 6, z0 + 2)] ?? Block.air;
  if (overA === Block.air || overB === Block.air) return;

  /**
   * Carve one shelled box: interior cells become air; boundary cells become
   * cobblestone (brick across the bottom face), skipping air and bedrock so
   * caves and the world floor survive intersection.
   */
  const box = (bx0: number, by0: number, bz0: number, bx1: number, by1: number, bz1: number): void => {
    for (let y = by0; y <= by1; y++) {
      for (let z = bz0; z <= bz1; z++) {
        for (let x = bx0; x <= bx1; x++) {
          const i = blockIndex(x, y, z);
          const cur = data[i] ?? Block.air;
          if (cur === Block.bedrock) continue;
          const edge = x === bx0 || x === bx1 || y === by0 || y === by1 || z === bz0 || z === bz1;
          if (!edge) data[i] = Block.air;
          else if (cur !== Block.air) data[i] = y === by0 ? Block.brick : Block.cobblestone;
        }
      }
    }
  };

  box(x0, y0, z0, x0 + 6, y0 + 5, z0 + 6); // room A shell around a 5x4x5 interior
  box(x0 + 8, y0, z0, x0 + 13, y0 + 4, z0 + 5); // room B shell around a 4x3x4 interior
  box(x0 + 6, y0, z0 + 2, x0 + 8, y0 + 3, z0 + 4); // corridor shell between them
  // Corridor interior: a 3-long, 2-tall opening whose ends punch doorways
  // through room A's +x wall and room B's -x wall.
  for (let x = x0 + 6; x <= x0 + 8; x++) {
    for (let y = y0 + 1; y <= y0 + 2; y++) data[blockIndex(x, y, z0 + 3)] = Block.air;
  }
  // Ember-lit wall corners, the loot chest, and room B's crystal.
  data[blockIndex(x0 + 1, y0 + 2, z0)] = Block.emberrock;
  data[blockIndex(x0 + 5, y0 + 2, z0 + 6)] = Block.emberrock;
  data[blockIndex(x0 + 1, y0 + 1, z0 + 1)] = Block.chest;
  data[blockIndex(x0 + 11, y0 + 1, z0 + 2)] = Block.crystal;
}

/** A local-space footprint: [x0, z0, width, depth]. */
type Rect = readonly [number, number, number, number];

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
}

/**
 * Hunt a flat-grass site for a w x d footprint: up to VILLAGE_SITE_TRIES
 * candidate origins are rolled from `hash` — each with the standard
 * margin/span interior pattern, from a fresh hash stream per attempt — and
 * the first whose columns are all grass at one height above the build line
 * (and clear of every rect in `avoid`) wins. Returns null when no candidate
 * fits; the planters' own checks still guard the final placement. Pure, so
 * village pieces stay deterministic while adapting to rough terrain far
 * better than a single blind pick would.
 */
function findFlatSite(
  data: Uint8Array,
  heights: Int32Array,
  hash: number,
  w: number,
  d: number,
  margin: number,
  avoid: readonly Rect[] = [],
): [number, number] | null {
  const spanX = CHUNK_SIZE - w - 2 * margin;
  const spanZ = CHUNK_SIZE - d - 2 * margin;
  if (spanX < 1 || spanZ < 1) return null;
  for (let t = 0; t < VILLAGE_SITE_TRIES; t++) {
    const h = hash2(hash, t + 1, w * CHUNK_SIZE + d);
    const x0 = margin + ((h >>> 4) % spanX);
    const z0 = margin + ((h >>> 12) % spanZ);
    if (avoid.some((r) => rectsOverlap([x0, z0, w, d], r))) continue;
    const base = heights[z0 * CHUNK_SIZE + x0] ?? -1;
    if (base < SEA_LEVEL + 2 || base + 7 >= CHUNK_HEIGHT) continue;
    let fits = true;
    for (let dz = 0; dz < d && fits; dz++) {
      for (let dx = 0; dx < w; dx++) {
        const x = x0 + dx;
        const z = z0 + dz;
        if ((heights[z * CHUNK_SIZE + x] ?? -1) !== base || data[blockIndex(x, base, z)] !== Block.grass) {
          fits = false;
          break;
        }
      }
    }
    if (fits) return [x0, z0];
  }
  return null;
}

/**
 * Dig a well over the 3x3 footprint at local origin (x0, z0): a cobblestone
 * rim at surface+1 ringing an open mouth, with the centre column dug two
 * deep and filled with water. Bails (leaving terrain untouched) unless the
 * whole footprint is flat grass above the build line, mirroring the hut
 * rules. Shared by hamlets and village centre chunks.
 */
export function tryPlantWell(data: Uint8Array, heights: Int32Array, x0: number, z0: number): void {
  const wx = x0 + 1; // shaft column at the footprint centre
  const wz = z0 + 1;
  const base = heights[wz * CHUNK_SIZE + wx] ?? -1;
  if (base < SEA_LEVEL + 2 || base + 2 >= CHUNK_HEIGHT) return;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((heights[(wz + dz) * CHUNK_SIZE + (wx + dx)] ?? -1) !== base) return;
      if (data[blockIndex(wx + dx, base, wz + dz)] !== Block.grass) return;
    }
  }
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      data[blockIndex(wx + dx, base + 1, wz + dz)] = Block.cobblestone;
    }
  }
  data[blockIndex(wx, base, wz)] = Block.water; // dig two down, fill water
  data[blockIndex(wx, base - 1, wz)] = Block.water;
}

/**
 * Plant a hamlet from local origin (x0, z0): two outpost huts side by side
 * at (x0, z0) and (x0+7, z0), plus a well between them one row south (its
 * shaft column sits at x0+5 or x0+6 by a hash bit, z at z0+6). Every piece
 * independently bails on unfit ground — the huts via tryPlantHut's own
 * flat-grass check, the well via tryPlantWell's — so a bumpy chunk may end
 * up with any subset, and untouched terrain everywhere a piece refused. The
 * full footprint spans HAMLET_W x HAMLET_D columns and must sit inside the
 * chunk.
 */
export function tryPlantHamlet(
  data: Uint8Array,
  heights: Int32Array,
  hash: number,
  x0: number,
  z0: number,
): void {
  tryPlantHut(data, heights, x0, z0);
  tryPlantHut(data, heights, x0 + 7, z0);
  tryPlantWell(data, heights, x0 + 4 + ((hash >>> 24) & 1), z0 + 5);
}

/**
 * Build a village long house on a flat 8x5 grass footprint at local (x0, z0):
 * a plank-walled hall with cobblestone corner pillars, a plank floor and
 * roof, a 2-tall door gap centred on the front (-z) wall, two glass windows
 * on the back wall, a lantern hung at the hall centre and a chest by the
 * door-side corner. Bails (leaving terrain untouched) unless every column
 * under the footprint is grass at the same height, mirroring the hut rules.
 */
export function tryPlantLongHouse(data: Uint8Array, heights: Int32Array, x0: number, z0: number): void {
  const baseY = heights[z0 * CHUNK_SIZE + x0] ?? 0;
  if (baseY < SEA_LEVEL + 2 || baseY + 6 >= CHUNK_HEIGHT) return;
  for (let dz = 0; dz < LONGHOUSE_D; dz++) {
    for (let dx = 0; dx < LONGHOUSE_W; dx++) {
      const x = x0 + dx;
      const z = z0 + dz;
      if ((heights[z * CHUNK_SIZE + x] ?? -1) !== baseY) return;
      if (data[blockIndex(x, baseY, z)] !== Block.grass) return;
    }
  }

  const floorY = baseY + 1;
  const wallTop = floorY + 3; // three-tall walls, like the hut
  const lastX = LONGHOUSE_W - 1;
  const lastZ = LONGHOUSE_D - 1;
  for (let dz = 0; dz < LONGHOUSE_D; dz++) {
    for (let dx = 0; dx < LONGHOUSE_W; dx++) {
      const x = x0 + dx;
      const z = z0 + dz;
      data[blockIndex(x, floorY, z)] = Block.planks; // floor
      data[blockIndex(x, wallTop + 1, z)] = Block.planks; // roof
      const edge = dx === 0 || dz === 0 || dx === lastX || dz === lastZ;
      const pillar = (dx === 0 || dx === lastX) && (dz === 0 || dz === lastZ);
      for (let y = floorY + 1; y <= wallTop; y++) {
        data[blockIndex(x, y, z)] = edge ? (pillar ? Block.cobblestone : Block.planks) : Block.air;
      }
    }
  }
  // Door: a 2-tall gap centred on the front (-z) wall.
  const doorX = x0 + (LONGHOUSE_W >> 1);
  data[blockIndex(doorX, floorY + 1, z0)] = Block.air;
  data[blockIndex(doorX, floorY + 2, z0)] = Block.air;
  // Two glass windows spaced along the back wall.
  data[blockIndex(x0 + 2, floorY + 2, z0 + lastZ)] = Block.glass;
  data[blockIndex(x0 + 5, floorY + 2, z0 + lastZ)] = Block.glass;
  // A lantern hung at the hall centre, and a chest in the corner.
  data[blockIndex(x0 + (LONGHOUSE_W >> 1), wallTop, z0 + (LONGHOUSE_D >> 1))] = Block.lantern;
  data[blockIndex(x0 + 1, floorY + 1, z0 + 1)] = Block.chest;
}

/**
 * Till a village farm plot over a flat 6x5 grass footprint at local
 * (x0, z0): the middle row is dug one deep and filled as a water channel,
 * and the rows either side turn to farmland carrying alternating
 * cropGrowing/cropRipe plants. Bails (leaving terrain untouched) unless the
 * whole footprint is grass at one height, mirroring the other planters.
 */
export function tryPlantFarm(data: Uint8Array, heights: Int32Array, x0: number, z0: number): void {
  const baseY = heights[z0 * CHUNK_SIZE + x0] ?? 0;
  if (baseY < SEA_LEVEL + 2 || baseY + 2 >= CHUNK_HEIGHT) return;
  for (let dz = 0; dz < FARM_D; dz++) {
    for (let dx = 0; dx < FARM_W; dx++) {
      if ((heights[(z0 + dz) * CHUNK_SIZE + (x0 + dx)] ?? -1) !== baseY) return;
      if (data[blockIndex(x0 + dx, baseY, z0 + dz)] !== Block.grass) return;
    }
  }

  const channel = FARM_D >> 1; // the middle row waters both sides
  for (let dz = 0; dz < FARM_D; dz++) {
    for (let dx = 0; dx < FARM_W; dx++) {
      const x = x0 + dx;
      const z = z0 + dz;
      if (dz === channel) {
        data[blockIndex(x, baseY, z)] = Block.water; // dig one, fill water
      } else {
        data[blockIndex(x, baseY, z)] = Block.farmland;
        data[blockIndex(x, baseY + 1, z)] = (dx + dz) % 2 === 0 ? Block.cropGrowing : Block.cropRipe;
      }
    }
  }
}

/**
 * Raise a lamp post at local column (x, z): a LAMP_HEIGHT-tall cobblestone
 * pillar crowned with a lantern, lighting village lanes at night. Bails
 * (leaving terrain untouched) unless the column is grass above the build
 * line, the 1x1 equivalent of the other planters' footprint checks.
 */
export function tryPlantLampPost(data: Uint8Array, heights: Int32Array, x: number, z: number): void {
  const base = heights[z * CHUNK_SIZE + x] ?? -1;
  if (base < SEA_LEVEL + 2 || base + LAMP_HEIGHT + 1 >= CHUNK_HEIGHT) return;
  if (data[blockIndex(x, base, z)] !== Block.grass) return;
  for (let dy = 1; dy <= LAMP_HEIGHT; dy++) data[blockIndex(x, base + dy, z)] = Block.cobblestone;
  data[blockIndex(x, base + LAMP_HEIGHT + 1, z)] = Block.lantern;
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
