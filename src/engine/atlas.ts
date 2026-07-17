/**
 * Procedural texture atlas: a 256x256 RGBA buffer of 16x16-pixel tiles, built
 * once at boot from a seeded PRNG. `generateAtlasPixels` is pure (no DOM) so
 * determinism is unit-testable; `createAtlasCanvas` blits it for rendering.
 */
import { rngFromSeed } from '../world/noise';

export const TILE_PX = 16;
export const ATLAS_TILES = 16;
export const ATLAS_PX = TILE_PX * ATLAS_TILES;

/** Tile slot indices in the atlas (all in row 0). */
export const Tiles = {
  stone: 0,
  dirt: 1,
  grassTop: 2,
  grassSide: 3,
  sand: 4,
  water: 5,
  logSide: 6,
  logTop: 7,
  leaves: 8,
  planks: 9,
  cobble: 10,
  glass: 11,
  snow: 12,
  bedrock: 13,
  brick: 14,
  ore: 15,
  // Row 1: item tiles.
  stick: 16,
  woodPickaxe: 17,
  stonePickaxe: 18,
  ironPickaxe: 19,
  meat: 20,
  furnaceSide: 21,
  furnaceFront: 22,
  chestSide: 23,
  chestTop: 24,
  charcoal: 25,
  ingot: 26,
  lantern: 27,
  coalOre: 28,
  copperOre: 29,
  goldOre: 30,
  coal: 31,
  copperIngot: 32,
  goldIngot: 33,
  copperPickaxe: 34,
  goldPickaxe: 35,
  ashstone: 36,
  emberrock: 37,
  riftframe: 38,
  geodeshell: 39,
  crystal: 40,
  gem: 41,
  gemPickaxe: 42,
  sapling: 43,
  cookedMeat: 44,
  ironVest: 45,
  goldVest: 46,
  gemVest: 47,
  bedTop: 48,
  bedSide: 49,
  throwingStone: 50,
  bucket: 51,
  waterBucket: 52,
  torch: 53,
  farmland: 54,
  cropSprout: 55,
  cropGrowing: 56,
  cropRipe: 57,
  seeds: 58,
  grain: 59,
  bread: 60,
  hoe: 61,
  // Mining-progress crack overlays, rendered on top of the block being dug.
  crack0: 62,
  crack1: 63,
  crack2: 64,
  crack3: 65,
  // Row 4 continues: ocean-life flora, then underworld flora.
  coralRose: 66,
  coralTeal: 67,
  seagrass: 68,
  glowmoss: 69,
  // Cave-biome décor (mossy hollows / cinder deeps), then surface flora.
  mossstone: 70,
  glowbloom: 71,
  cindercap: 72,
  wildgrass: 73,
  sunwisp: 74,
  duskbell: 75,
  // Deep-boss summon totem and its reward tier.
  sovereignTotem: 76,
  kingsplitter: 77,
  crown: 78,
  // The Stone Colossus' hoard.
  titanHeart: 79,
  earthshaker: 80,
  // Deep-metal ores and their gear.
  silverOre: 81,
  duskOre: 82,
  emberOre: 83,
  silverIngot: 84,
  duskIngot: 85,
  emberShard: 86,
  silverVest: 87,
  duskVest: 88,
  duskblade: 89,
  // Shrine altars and the Tyrant's boost hoard.
  altar: 90,
  tyrantEye: 91,
  heartstone: 92,
  // The underworld endgame: the Monarch's throne and hoard.
  emberthrone: 93,
  ashbloom: 94,
  nightsever: 95,
  ashcrown: 96,
} as const;

type Rng = () => number;
type TilePainter = (set: (x: number, y: number, r: number, g: number, b: number, a?: number) => void, rng: Rng) => void;

function jitter(rng: Rng, amount: number): number {
  return (rng() - 0.5) * amount;
}

const paintStone: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      let l = 125 + jitter(rng, 24);
      if (rng() < 0.08) l -= 30;
      set(x, y, l, l, l + 2);
    }
  }
};

const paintDirt: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const n = jitter(rng, 28);
      set(x, y, 134 + n, 96 + n * 0.8, 67 + n * 0.6);
    }
  }
};

const paintGrassTop: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const n = jitter(rng, 26);
      set(x, y, 96 + n * 0.7, 160 + n, 56 + n * 0.5);
    }
  }
};

/** Dirt with a 4px grass band on top; row 4 gets a ragged transition. */
const paintGrassSide: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const n = jitter(rng, 26);
      if (y < 4 || (y === 4 && rng() < 0.3)) {
        set(x, y, 96 + n * 0.7, 160 + n, 56 + n * 0.5);
      } else {
        set(x, y, 134 + n, 96 + n * 0.8, 67 + n * 0.6);
      }
    }
  }
};

const paintSand: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const n = jitter(rng, 18);
      set(x, y, 218 + n, 206 + n, 160 + n * 0.8);
    }
  }
};

export const WATER_ALPHA = 166; // 0.65 * 255, baked into the tile

const paintWater: TilePainter = (set) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      set(x, y, 52, 110, 198, WATER_ALPHA);
    }
  }
};

/** Vertical bark streaks: per-column darkness plus per-pixel grain. */
const paintLogSide: TilePainter = (set, rng) => {
  const colShade: number[] = [];
  for (let x = 0; x < TILE_PX; x++) colShade.push(rng() < 0.35 ? -20 : rng() < 0.2 ? 14 : 0);
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const n = jitter(rng, 16) + (colShade[x] ?? 0);
      set(x, y, 104 + n, 82 + n * 0.8, 50 + n * 0.5);
    }
  }
};

/** Concentric rings around the tile center, bark-colored rim. */
const paintLogTop: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      const r = Math.sqrt(dx * dx + dy * dy);
      const n = jitter(rng, 10);
      if (r > 7) {
        set(x, y, 104 + n, 82 + n * 0.8, 50 + n * 0.5);
      } else if (Math.floor(r * 1.6) % 2 === 0) {
        set(x, y, 168 + n, 134 + n * 0.8, 82 + n * 0.5);
      } else {
        set(x, y, 134 + n, 106 + n * 0.8, 62 + n * 0.5);
      }
    }
  }
};

export const LEAF_HOLE_CHANCE = 0.15;

const paintLeaves: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      if (rng() < LEAF_HOLE_CHANCE) {
        set(x, y, 0, 0, 0, 0);
      } else {
        const n = jitter(rng, 12);
        if (rng() < 0.5) set(x, y, 54 + n, 118 + n, 40 + n * 0.5);
        else set(x, y, 72 + n, 148 + n, 52 + n * 0.5);
      }
    }
  }
};

/** Horizontal plank courses with seam lines and one vertical joint each. */
const paintPlanks: TilePainter = (set, rng) => {
  const tone: number[] = [];
  const joint: number[] = [];
  for (let b = 0; b < 4; b++) {
    tone.push(jitter(rng, 20));
    joint.push(Math.floor(rng() * TILE_PX));
  }
  for (let y = 0; y < TILE_PX; y++) {
    const band = Math.floor(y / 4);
    for (let x = 0; x < TILE_PX; x++) {
      const n = jitter(rng, 10) + (tone[band] ?? 0);
      if (y % 4 === 3 || x === joint[band]) {
        set(x, y, 110 + n * 0.5, 84 + n * 0.4, 48 + n * 0.3);
      } else {
        set(x, y, 168 + n, 134 + n * 0.8, 82 + n * 0.5);
      }
    }
  }
};

/** Blobby grey stones separated by dark mortar, from smoothed lattice noise. */
const paintCobble: TilePainter = (set, rng) => {
  const L = 5;
  const lattice: number[] = [];
  for (let i = 0; i < L * L; i++) lattice.push(rng());
  const sample = (x: number, y: number): number => {
    const fx = (x / TILE_PX) * (L - 1);
    const fy = (y / TILE_PX) * (L - 1);
    const ix = Math.min(L - 2, Math.floor(fx));
    const iy = Math.min(L - 2, Math.floor(fy));
    const tx = fx - ix;
    const ty = fy - iy;
    const v00 = lattice[iy * L + ix] ?? 0;
    const v10 = lattice[iy * L + ix + 1] ?? 0;
    const v01 = lattice[(iy + 1) * L + ix] ?? 0;
    const v11 = lattice[(iy + 1) * L + ix + 1] ?? 0;
    return v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty) + v01 * (1 - tx) * ty + v11 * tx * ty;
  };
  const quant = (x: number, y: number): number => Math.min(2, Math.floor(sample(x, y) * 3));
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const q = quant(x, y);
      const edge =
        (x + 1 < TILE_PX && quant(x + 1, y) !== q) || (y + 1 < TILE_PX && quant(x, y + 1) !== q);
      const n = jitter(rng, 14);
      if (edge) {
        set(x, y, 72 + n * 0.5, 72 + n * 0.5, 74 + n * 0.5);
      } else {
        const base = q === 0 ? 104 : q === 1 ? 128 : 148;
        set(x, y, base + n, base + n, base + 2 + n);
      }
    }
  }
};

/** 1px frame plus small corner notches; interior fully transparent. */
const paintGlass: TilePainter = (set) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      set(x, y, 0, 0, 0, 0);
    }
  }
  const frame = (x: number, y: number): void => set(x, y, 208, 228, 240, 255);
  for (let i = 0; i < TILE_PX; i++) {
    frame(i, 0);
    frame(i, 15);
    frame(0, i);
    frame(15, i);
  }
  for (const [cx, cy] of [
    [2, 2],
    [13, 2],
    [2, 13],
    [13, 13],
  ] as const) {
    frame(cx, cy);
    frame(cx + (cx < 8 ? 1 : -1), cy);
    frame(cx, cy + (cy < 8 ? 1 : -1));
  }
};

const paintSnow: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const n = jitter(rng, 10);
      set(x, y, 236 + n, 240 + n, 246 + n);
    }
  }
};

const paintBedrock: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const l = 64 + jitter(rng, 56);
      set(x, y, l, l, l + 2);
    }
  }
};

/** Red brick courses, light mortar rows and staggered vertical joints. */
const paintBrick: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    const course = Math.floor(y / 4);
    for (let x = 0; x < TILE_PX; x++) {
      const shifted = (x + course * 4) % TILE_PX;
      const n = jitter(rng, 16);
      if (y % 4 === 0 || shifted % 8 === 0) {
        set(x, y, 186 + n * 0.5, 178 + n * 0.5, 168 + n * 0.5);
      } else {
        set(x, y, 150 + n, 68 + n * 0.5, 56 + n * 0.4);
      }
    }
  }
};

/** Stone base with rust-colored mineral clusters. */
/** Stone base with mineral speckle clusters in the given ore color. */
function paintOreTile(r: number, g: number, b: number): TilePainter {
  return (set, rng) => {
    const clusters: Array<[number, number]> = [];
    for (let i = 0; i < 6; i++) {
      clusters.push([1 + Math.floor(rng() * 13), 1 + Math.floor(rng() * 13)]);
    }
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        let l = 125 + jitter(rng, 24);
        if (rng() < 0.08) l -= 28;
        set(x, y, l, l, l + 2);
      }
    }
    for (const [cx, cy] of clusters) {
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        if (rng() < 0.8) {
          const n = jitter(rng, 22);
          set(cx + dx, cy + dy, r + n, g + n * 0.7, b + n * 0.5);
        }
      }
    }
  };
}

const paintOre = paintOreTile(188, 124, 58); // iron

/** Slim diagonal stick on a transparent tile. */
const paintStick: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  for (let i = 3; i <= 12; i++) {
    const n = jitter(rng, 14);
    set(i, 15 - i, 124 + n, 92 + n * 0.7, 56 + n * 0.5);
    set(i + 1, 15 - i, 104 + n, 78 + n * 0.7, 46 + n * 0.5);
  }
};

/** Pickaxe: diagonal handle plus an arced head in the tier material. */
function paintPickaxe(r: number, g: number, b: number): TilePainter {
  return (set, rng) => {
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
    }
    // Handle from bottom-left toward the head.
    for (let i = 2; i <= 11; i++) {
      const n = jitter(rng, 12);
      set(i, 15 - i, 124 + n, 92 + n * 0.7, 56 + n * 0.5);
      set(i + 1, 15 - i, 104 + n, 78 + n * 0.7, 46 + n * 0.5);
    }
    // Head arc.
    const head: Array<[number, number]> = [
      [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2],
      [3, 3], [4, 3], [5, 3], [10, 3], [11, 3], [12, 3],
      [2, 4], [3, 4], [12, 4], [13, 4],
      [2, 5], [13, 5], [13, 6], [2, 6],
    ];
    for (const [hx, hy] of head) {
      const n = jitter(rng, 18);
      set(hx, hy, r + n, g + n * 0.8, b + n * 0.6);
    }
  };
}

/** A haunch: rosy meat blob with a small bone stub. */
const paintMeat: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const d = Math.hypot(x - 6, y - 6);
      if (d < 4.6) {
        const n = jitter(rng, 22);
        set(x, y, 188 + n, 96 + n * 0.6, 74 + n * 0.5);
      }
    }
  }
  for (let i = 10; i <= 13; i++) {
    const n = jitter(rng, 10);
    set(i, i, 226 + n, 222 + n, 212 + n);
    set(i + 1, i, 226 + n, 222 + n, 212 + n);
  }
};

/** Furnace side: dark dressed stone blocks. */
const paintFurnaceSide: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const seam = x % 8 === 0 || y % 4 === 0;
      const n = jitter(rng, 14);
      const base = seam ? 70 : 104;
      set(x, y, base + n, base + n, base + 2 + n);
    }
  }
};

/** Furnace front: stone frame around a dark arch with embers. */
const paintFurnaceFront: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const n = jitter(rng, 14);
      const inMouth = x >= 4 && x <= 11 && y >= 6 && y <= 13;
      if (inMouth) {
        if (y >= 11 && rng() < 0.5) {
          const e = jitter(rng, 30);
          set(x, y, 210 + e, 120 + e * 0.5, 40 + e * 0.3); // ember
        } else {
          set(x, y, 18 + n * 0.3, 16 + n * 0.3, 18 + n * 0.3); // dark interior
        }
      } else {
        const base = 104;
        set(x, y, base + n, base + n, base + 2 + n);
      }
    }
  }
};

/** Chest side: wood planks with a dark iron band and a clasp. */
const paintChestSide: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const n = jitter(rng, 12);
      const plankSeam = y % 5 === 0;
      const base = plankSeam ? 120 : 162;
      set(x, y, base + n, (base - 36) + n * 0.8, (base - 84) + n * 0.5);
    }
  }
  // Iron band across the middle + a small clasp.
  for (let x = 0; x < TILE_PX; x++) {
    const n = jitter(rng, 10);
    set(x, 7, 60 + n, 60 + n, 64 + n);
    set(x, 8, 48 + n, 48 + n, 52 + n);
  }
  for (let y = 6; y <= 9; y++) for (let x = 7; x <= 8; x++) set(x, y, 40, 40, 44);
};

/** Chest top: planks with two iron straps and a latch. */
const paintChestTop: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const n = jitter(rng, 12);
      const base = x % 5 === 0 ? 120 : 162;
      set(x, y, base + n, (base - 36) + n * 0.8, (base - 84) + n * 0.5);
    }
  }
  for (const sx of [3, 12]) {
    for (let y = 0; y < TILE_PX; y++) {
      const n = jitter(rng, 10);
      set(sx, y, 60 + n, 60 + n, 64 + n);
    }
  }
};

/** Charcoal: dark lump with a faint sheen. */
const paintCharcoal: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      if (Math.hypot(x - 7.5, y - 8) < 5.6) {
        const n = jitter(rng, 18);
        set(x, y, 38 + n, 36 + n, 40 + n);
      }
    }
  }
  for (let i = 5; i <= 8; i++) set(i, 5, 96, 96, 104); // sheen
};

/** Ingot/bar factory: a rounded metal bar in the given color with a highlight. */
function paintBar(r: number, g: number, b: number, hr: number, hg: number, hb: number): TilePainter {
  return (set, rng) => {
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
    }
    for (let y = 5; y <= 11; y++) {
      for (let x = 3; x <= 12; x++) {
        const inset = (y === 5 || y === 11) && (x === 3 || x === 12);
        if (inset) continue;
        const n = jitter(rng, 16);
        set(x, y, r + n, g + n, b + n);
      }
    }
    for (let x = 4; x <= 9; x++) set(x, 6, hr, hg, hb); // highlight
  };
}

const paintIngot = paintBar(196, 198, 206, 232, 234, 240); // iron

/** A wall torch: dark stone surround, a central stick, and a bright flame. */
const paintTorch: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const n = jitter(rng, 12);
      set(x, y, 44 + n, 42 + n, 48 + n); // shadowed surround
    }
  }
  for (let y = 6; y <= 14; y++) {
    const n = jitter(rng, 12);
    set(7, y, 120 + n, 88 + n * 0.7, 52 + n * 0.5); // stick
    set(8, y, 104 + n, 76 + n * 0.7, 46 + n * 0.5);
  }
  // Flame.
  for (let y = 2; y <= 6; y++) {
    for (let x = 6; x <= 9; x++) {
      const d = Math.abs(x - 7.5) + Math.abs(y - 4);
      if (d > 3) continue;
      const n = jitter(rng, 18);
      set(x, y, 250, 200 + n, 90 + (6 - y) * 14);
    }
  }
};

/** A metal pail; `fill` (>0) paints a coloured liquid band inside. */
function paintBucket(fillR: number, fillG: number, fillB: number, filled: boolean): TilePainter {
  return (set, rng) => {
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
    }
    // Pail body: a downward taper from x[3,12] at the rim to x[5,10] at the base.
    for (let y = 4; y <= 13; y++) {
      const inset = Math.floor((y - 4) * 0.25);
      for (let x = 3 + inset; x <= 12 - inset; x++) {
        const n = jitter(rng, 14);
        const rim = y === 4;
        set(x, y, (rim ? 150 : 122) + n, (rim ? 154 : 126) + n, (rim ? 162 : 134) + n);
      }
    }
    if (filled) {
      for (let y = 5; y <= 7; y++) {
        for (let x = 4; x <= 11; x++) {
          const n = jitter(rng, 16);
          set(x, y, fillR + n, fillG + n, fillB + n);
        }
      }
    }
  };
}

/** Bed top: a red quilt with a pale pillow stripe along one end. */
const paintBedTop: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const n = jitter(rng, 16);
      if (y < 4) set(x, y, 226 + n, 226 + n, 214 + n); // pillow end
      else set(x, y, 168 + n, 52 + n * 0.6, 58 + n * 0.6); // quilt
    }
  }
};

/** Bed side: a wooden frame with a coloured mattress band. */
const paintBedSide: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const n = jitter(rng, 14);
      if (y < 7) set(x, y, 168 + n, 52 + n * 0.6, 58 + n * 0.6); // mattress
      else set(x, y, 120 + n, 88 + n * 0.7, 52 + n * 0.5); // wood frame
    }
  }
};

/** A chest-plate / vest silhouette in the given metal colour. */
function paintVest(r: number, g: number, b: number): TilePainter {
  return (set, rng) => {
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
    }
    for (let y = 3; y <= 13; y++) {
      for (let x = 3; x <= 12; x++) {
        // Shoulder notch and a neck gap at the top centre.
        if (y === 3 && (x < 5 || x > 10)) continue;
        if (y <= 4 && x >= 7 && x <= 8) continue;
        const n = jitter(rng, 18);
        set(x, y, r + n, g + n, b + n);
      }
    }
    for (let x = 5; x <= 10; x++) set(x, 5, r + 40, g + 40, b + 40); // chest sheen
  };
}

/** Rounded lump (coal, etc.) in the given color. */
function paintLump(r: number, g: number, b: number, sheen: number): TilePainter {
  return (set, rng) => {
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
    }
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        if (Math.hypot(x - 7.5, y - 8) < 5.6) {
          const n = jitter(rng, 18);
          set(x, y, r + n, g + n, b + n);
        }
      }
    }
    for (let i = 5; i <= 8; i++) set(i, 5, sheen, sheen, sheen + 8); // sheen
  };
}

/** Warm glowing core behind a dark cage frame. */
const paintLantern: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      const n = jitter(rng, 14);
      if (d > 6.5) {
        set(x, y, 52 + n * 0.4, 44 + n * 0.4, 38 + n * 0.4); // frame
      } else if ((x === 4 || x === 11) && y > 2 && y < 13) {
        set(x, y, 60 + n * 0.4, 50 + n * 0.4, 42 + n * 0.4); // cage bars
      } else {
        const glow = Math.max(0, 1 - d / 7);
        set(x, y, 232 + n, 196 + glow * 30 + n * 0.8, 96 + glow * 40 + n * 0.5);
      }
    }
  }
};

/** Dark violet-grey volcanic stone with coarse speckle. */
const paintAshstone: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      let l = 70 + jitter(rng, 22);
      if (rng() < 0.1) l -= 18;
      set(x, y, l + 8, l, l + 14);
    }
  }
};

/** Ashstone shot through with glowing ember cracks. */
const paintEmberrock: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const l = 70 + jitter(rng, 18);
      set(x, y, l + 8, l, l + 14);
    }
  }
  // A few bright lava veins.
  for (let v = 0; v < 4; v++) {
    let cx = 1 + Math.floor(rng() * 14);
    let cy = 1 + Math.floor(rng() * 14);
    const steps = 4 + Math.floor(rng() * 6);
    for (let i = 0; i < steps; i++) {
      const n = jitter(rng, 30);
      set(cx, cy, 236 + n, 140 + n * 0.6, 48 + n * 0.3);
      cx = Math.max(0, Math.min(15, cx + (rng() < 0.5 ? 1 : -1)));
      cy = Math.max(0, Math.min(15, cy + (rng() < 0.5 ? 1 : -1)));
    }
  }
};

/** Rift frame: dark stone bezel around a faint violet swirl. */
const paintRiftframe: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      if (edge) {
        const n = jitter(rng, 14);
        set(x, y, 44 + n, 40 + n, 52 + n);
      } else {
        const d = Math.hypot(x - 7.5, y - 7.5);
        const swirl = 0.5 + 0.5 * Math.sin(d * 1.4 - (x - y) * 0.4);
        const n = jitter(rng, 12);
        set(x, y, 70 + swirl * 60 + n, 40 + swirl * 20 + n, 110 + swirl * 80 + n);
      }
    }
  }
};

/** Knobbly dark mineral shell that lines a geode. */
const paintGeodeShell: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      let l = 96 + jitter(rng, 26);
      if (rng() < 0.16) l -= 26;
      set(x, y, l, l - 6, l + 4);
    }
  }
};

/** Faceted violet crystal lining, faintly glowing. */
const paintCrystal: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const facet = 0.5 + 0.5 * Math.sin((x + y) * 0.9 + Math.sin(x * 0.7) * 2);
      const n = jitter(rng, 18);
      set(x, y, 138 + facet * 70 + n, 96 + facet * 40 + n, 196 + facet * 50 + n);
    }
  }
};

/** Cut gemstone item on a transparent tile. */
const paintGem: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  const pts: Array<[number, number]> = [
    [7, 2], [8, 2],
    [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5],
    [4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [11, 8],
    [6, 11], [7, 11], [8, 11], [9, 11],
    [7, 13], [8, 13],
  ];
  for (const [x, y] of pts) {
    const n = jitter(rng, 28);
    set(x, y, 150 + n, 110 + n, 224 + n * 0.5);
  }
  set(6, 4, 220, 200, 250); // glint
};

/** A tiny seedling: a stem with a couple of leaf nubs, transparent tile. */
const paintSapling: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  for (let y = 8; y <= 13; y++) {
    const n = jitter(rng, 12);
    set(7, y, 104 + n, 78 + n * 0.7, 46 + n * 0.5);
    set(8, y, 92 + n, 68 + n * 0.7, 40 + n * 0.5);
  }
  for (const [x, y] of [
    [5, 7], [6, 6], [7, 6], [8, 6], [9, 6], [10, 7],
    [6, 8], [7, 7], [8, 7], [9, 8],
  ] as const) {
    const n = jitter(rng, 16);
    set(x, y, 60 + n, 130 + n, 48 + n * 0.5);
  }
};

/** A browned, cooked haunch. */
const paintCookedMeat: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const d = Math.hypot(x - 6, y - 6);
      if (d < 4.6) {
        const n = jitter(rng, 20);
        set(x, y, 138 + n, 80 + n * 0.6, 50 + n * 0.5);
      }
    }
  }
  for (let i = 10; i <= 13; i++) {
    const n = jitter(rng, 10);
    set(i, i, 226 + n, 222 + n, 212 + n);
    set(i + 1, i, 226 + n, 222 + n, 212 + n);
  }
};

/** Tilled soil: dark moist furrows alternating with drier ridge rows. */
const paintFarmland: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    const furrow = y % 4 < 2;
    for (let x = 0; x < TILE_PX; x++) {
      const n = jitter(rng, 22);
      if (furrow) set(x, y, 96 + n, 66 + n * 0.8, 44 + n * 0.6);
      else set(x, y, 134 + n, 96 + n * 0.8, 67 + n * 0.6);
    }
  }
};

/** Crop foliage: stalks rise and thicken with the stage; ripe gains amber heads. */
function paintCrop(stage: 0 | 1 | 2): TilePainter {
  return (set, rng) => {
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
    }
    const top = stage === 0 ? 10 : stage === 1 ? 6 : 3;
    for (const sx of [2, 5, 8, 11, 14] as const) {
      const wobble = rng() < 0.5 ? 0 : 1;
      for (let y = 15; y >= top + wobble; y--) {
        const n = jitter(rng, 16);
        if (stage === 2 && y <= top + 3) set(sx, y, 214 + n, 178 + n * 0.8, 74 + n * 0.5);
        else set(sx, y, 92 + n, 152 + n, 58 + n * 0.5);
      }
      if (stage >= 1 && rng() < 0.8) {
        const ly = 9 + Math.floor(rng() * 4);
        set(sx === 14 ? 13 : sx + 1, ly, 80 + jitter(rng, 12), 140, 52);
      }
    }
  };
}

/** A pinch of pale seeds scattered on a transparent tile. */
const paintSeeds: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  for (let i = 0; i < 9; i++) {
    const x = 3 + Math.floor(rng() * 10);
    const y = 4 + Math.floor(rng() * 9);
    const n = jitter(rng, 14);
    set(x, y, 208 + n, 186 + n, 128 + n);
    set(x + 1, y, 184 + n, 160 + n, 104 + n);
  }
};

/** A tied sheaf of amber grain stalks. */
const paintGrain: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  for (const [x0, lean] of [
    [5, 0],
    [7, 0],
    [9, 0],
    [6, 1],
    [8, 1],
  ] as const) {
    for (let y = 2; y <= 13; y++) {
      const x = x0 + (y < 6 ? lean : 0);
      const n = jitter(rng, 18);
      if (y < 6) set(x, y, 224 + n, 190 + n, 80 + n * 0.5);
      else set(x, y, 196 + n, 158 + n, 80 + n * 0.5);
    }
  }
  for (let x = 4; x <= 11; x++) set(x, 9, 140, 104, 56); // twine
};

/** A crusty loaf: browned top, pale crumb, scored surface. */
const paintBread: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  for (let y = 5; y <= 12; y++) {
    for (let x = 2; x <= 13; x++) {
      if ((x === 2 || x === 13) && (y === 5 || y === 12)) continue; // round corners
      const n = jitter(rng, 14);
      if (y <= 6) set(x, y, 212 + n, 158 + n * 0.8, 92 + n * 0.5);
      else if (y === 12 || x === 2 || x === 13) set(x, y, 178 + n, 122 + n * 0.8, 66 + n * 0.5);
      else set(x, y, 238 + n, 214 + n, 168 + n);
    }
  }
  for (const sx of [5, 8, 11] as const) set(sx, 6, 160, 108, 60); // scoring
};

/** Hoe: the familiar diagonal handle with a flat blade turning down at the tip. */
const paintHoe: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  for (let i = 2; i <= 11; i++) {
    const n = jitter(rng, 12);
    set(i, 15 - i, 124 + n, 92 + n * 0.7, 56 + n * 0.5);
    set(i + 1, 15 - i, 104 + n, 78 + n * 0.7, 46 + n * 0.5);
  }
  for (const [hx, hy] of [
    [8, 2],
    [9, 2],
    [10, 2],
    [11, 2],
    [12, 2],
    [12, 3],
    [12, 4],
    [13, 3],
  ] as const) {
    const n = jitter(rng, 16);
    set(hx, hy, 196 + n, 198 + n, 206 + n);
  }
};

/**
 * Mining-progress crack overlay: jagged near-black fissures radiating from
 * around the tile centre on a fully transparent background. Higher stages draw
 * more rays, walk them further (stage 3 reaches the tile edges), and sprout
 * side branches, so the overlay reads as damage densifying into a web. All
 * jitter comes from the provided rng, keeping the tile deterministic per seed.
 */
function paintCrack(stage: 0 | 1 | 2 | 3): TilePainter {
  const rays = 3 + stage * 2; // 3 / 5 / 7 / 9 primary fissures
  const steps = 3 + stage * 2; // 3 / 5 / 7 / 9 pixels walked per fissure
  const branchLen = stage === 3 ? 4 : 3; // only used when stage >= 2
  return (set, rng) => {
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
    }
    const ink = (x: number, y: number): void => {
      const n = jitter(rng, 12);
      if (x < 0 || y < 0 || x >= TILE_PX || y >= TILE_PX) return;
      set(x, y, 20 + n, 18 + n, 22 + n, 255);
    };
    /** Walk a fissure: advance ~1px per step with angular wobble, clamped in-tile. */
    const walk = (x: number, y: number, ang: number, len: number): void => {
      for (let i = 0; i < len; i++) {
        ang += jitter(rng, 1.1);
        x = Math.max(0, Math.min(TILE_PX - 1, x + Math.cos(ang)));
        y = Math.max(0, Math.min(TILE_PX - 1, y + Math.sin(ang)));
        ink(Math.round(x), Math.round(y));
      }
    };
    for (let r = 0; r < rays; r++) {
      const ang = (r / rays) * Math.PI * 2 + jitter(rng, 0.9);
      const sx = 7.5 + jitter(rng, 3);
      const sy = 7.5 + jitter(rng, 3);
      ink(Math.round(sx), Math.round(sy));
      walk(sx, sy, ang, steps);
      if (stage >= 2) {
        // One side branch per ray, forking partway along the primary direction.
        const t = 1 + rng() * (steps - 2);
        const bx = sx + Math.cos(ang) * t;
        const by = sy + Math.sin(ang) * t;
        walk(bx, by, ang + (rng() < 0.5 ? 1 : -1) * (0.7 + rng() * 0.8), branchLen);
      }
    }
  };
}

/**
 * Branching coral in the given vivid tone over a darker reef-rock base. Three
 * polyp branches walk upward from the tile bottom with lateral wobble and
 * occasional side nubs; every pixel stays fully opaque so the directional
 * shading post-pass applies to coral blocks like any other stone.
 */
function paintCoral(r: number, g: number, b: number): TilePainter {
  return (set, rng) => {
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const n = jitter(rng, 14);
        set(x, y, r * 0.42 + n, g * 0.42 + n * 0.8, b * 0.42 + n * 0.8);
      }
    }
    for (const bx of [3, 7, 11] as const) {
      let x = bx + Math.floor(rng() * 2);
      const top = 2 + Math.floor(rng() * 3);
      for (let y = TILE_PX - 1; y >= top; y--) {
        const n = jitter(rng, 22);
        set(x, y, r + n, g + n * 0.8, b + n * 0.8);
        if (rng() < 0.55) set(Math.min(15, x + 1), y, r * 0.8 + n, g * 0.8 + n * 0.8, b * 0.8 + n * 0.8);
        if (rng() < 0.3 && y < 12) {
          // A side nub sprouting off the branch.
          const sx = Math.max(0, Math.min(15, x + (rng() < 0.5 ? -1 : 2)));
          set(sx, y, r + n, g + n * 0.8, b + n * 0.8);
        }
        x = Math.max(1, Math.min(14, x + (rng() < 0.3 ? -1 : rng() < 0.45 ? 1 : 0)));
      }
      set(Math.max(0, Math.min(15, x)), Math.max(0, top - 1), 255, 244, 240); // pale polyp tip
    }
  };
}

/** Five wavy seagrass blades swaying up from the tile base, transparent elsewhere. */
const paintSeagrass: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  for (const bx of [2, 5, 8, 11, 14] as const) {
    const top = 2 + Math.floor(rng() * 4);
    const phase = rng() * Math.PI * 2;
    for (let y = TILE_PX - 1; y >= top; y--) {
      const sway = Math.round(Math.sin(y * 0.55 + phase) * 1.4);
      const x = Math.max(0, Math.min(15, bx + sway));
      const n = jitter(rng, 16);
      set(x, y, 58 + n, 138 + n, 74 + n * 0.6);
      if (rng() < 0.3) set(Math.min(15, x + 1), y, 46 + n, 118 + n, 62 + n * 0.6);
    }
  }
};

/**
 * Glowmoss ground cover: clumpy teal-cyan moss patches hugging the lower half
 * of a transparent tile, dotted with bright cyan speck highlights so the
 * emissive cave light reads at a glance. Every opaque pixel keeps green and
 * blue well above red, and well under half the tile is covered.
 */
const paintGlowmoss: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  const mossy = new Uint8Array(TILE_PX * TILE_PX);
  for (let c = 0; c < 5; c++) {
    const cx = 1 + rng() * 13;
    const cy = 9 + rng() * 5; // clumps hug the tile floor
    const r = 1.3 + rng() * 1.6;
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        if (Math.hypot(x - cx, (y - cy) * 1.35) >= r) continue;
        const n = jitter(rng, 18);
        set(x, y, 24 + n * 0.4, 148 + n, 130 + n * 0.9);
        mossy[y * TILE_PX + x] = 1;
      }
    }
  }
  // Bright glowing specks, only ever on moss.
  let placed = 0;
  for (let tries = 0; tries < 48 && placed < 7; tries++) {
    const x = Math.floor(rng() * TILE_PX);
    const y = Math.floor(rng() * TILE_PX);
    if (mossy[y * TILE_PX + x] !== 1) continue;
    set(x, y, 168, 255, 236);
    placed++;
  }
};

/**
 * Mossstone: plain cave stone shot through with creeping green moss veins.
 * Every pixel stays fully opaque, so the directional shading post-pass bakes
 * its bevel into this tile exactly as it does for ordinary stone.
 */
const paintMossstone: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      let l = 118 + jitter(rng, 22);
      if (rng() < 0.08) l -= 26;
      set(x, y, l - 4, l, l - 2);
    }
  }
  // Creeping moss veins wandering across the face.
  for (let v = 0; v < 5; v++) {
    let cx = 1 + Math.floor(rng() * 14);
    let cy = 1 + Math.floor(rng() * 14);
    const steps = 5 + Math.floor(rng() * 6);
    for (let i = 0; i < steps; i++) {
      const n = jitter(rng, 18);
      set(cx, cy, 66 + n * 0.5, 142 + n, 60 + n * 0.5);
      if (rng() < 0.4) set(Math.min(15, cx + 1), cy, 58 + n * 0.5, 126 + n, 54 + n * 0.5);
      cx = Math.max(0, Math.min(15, cx + (rng() < 0.5 ? 1 : -1)));
      cy = Math.max(0, Math.min(15, cy + (rng() < 0.5 ? 1 : -1)));
    }
  }
};

/**
 * Glowbloom: a cave flower on a transparent tile — a slim stem rising from
 * the tile base into a ring of warm chartreuse petals around a bright core,
 * matching the block's soft light emission.
 */
const paintGlowbloom: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  for (let y = 7; y <= 15; y++) {
    const n = jitter(rng, 12);
    set(7, y, 74 + n * 0.5, 128 + n, 52 + n * 0.5); // stem
    if (rng() < 0.35) set(8, y, 64 + n * 0.5, 112 + n, 46 + n * 0.5);
  }
  // Petal ring: warm chartreuse (green-leaning yellow) around the head.
  for (const [px, py] of [
    [6, 3], [7, 3], [8, 3],
    [5, 4], [9, 4],
    [5, 5], [9, 5],
    [6, 6], [7, 6], [8, 6],
  ] as const) {
    const n = jitter(rng, 20);
    set(px, py, 188 + n * 0.8, 232 + n, 72 + n * 0.4);
  }
  set(7, 4, 244, 255, 168); // glowing core
  set(8, 4, 236, 252, 150);
  set(7, 5, 236, 252, 150);
};

/**
 * Cindercap: a squat cave mushroom on a transparent tile — a dark ashen
 * stalk under a dim orange cap with faint ember flecks, matching the
 * block's low light emission.
 */
const paintCindercap: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  for (let y = 9; y <= 15; y++) {
    const n = jitter(rng, 12);
    set(7, y, 56 + n * 0.5, 48 + n * 0.5, 46 + n * 0.5); // dark stalk
    set(8, y, 48 + n * 0.5, 42 + n * 0.5, 40 + n * 0.5);
  }
  // Dim orange cap dome, widest just above the stalk.
  for (let y = 5; y <= 8; y++) {
    const half = y === 5 ? 2 : y === 6 ? 3 : 4;
    for (let x = 8 - half; x <= 7 + half; x++) {
      const n = jitter(rng, 16);
      set(x, y, 176 + n, 92 + n * 0.6, 34 + n * 0.3);
    }
  }
  set(6, 6, 232, 148, 62); // ember flecks on the cap
  set(9, 7, 224, 138, 56);
};

/**
 * Wildgrass: a meadow tuft on a transparent tile — several kinked green
 * blades fanning up from the tile base, sparser and straighter than the
 * swaying underwater seagrass so the two read differently.
 */
const paintWildgrass: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  for (const bx of [2, 4, 7, 9, 12, 14] as const) {
    const top = 3 + Math.floor(rng() * 5);
    const kinkY = 6 + Math.floor(rng() * 5);
    const lean = rng() < 0.5 ? -1 : 1;
    for (let y = TILE_PX - 1; y >= top; y--) {
      const x = Math.max(0, Math.min(15, y < kinkY ? bx + lean : bx));
      const n = jitter(rng, 18);
      set(x, y, 84 + n * 0.7, 152 + n, 54 + n * 0.5);
    }
  }
};

/**
 * A single wildflower on a transparent tile: a stem with a leaf nub and a
 * plus-shaped petal head around a contrasting core. Shared silhouette for
 * both meadow flower species; only the petal/core palette differs.
 */
function paintFlower(pr: number, pg: number, pb: number, cr: number, cg: number, cb: number): TilePainter {
  return (set, rng) => {
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
    }
    // A slightly waving stem up the centre.
    for (let y = 7; y <= 15; y++) {
      const wob = y < 11 ? 0 : 1;
      const n = jitter(rng, 10);
      set(7 - wob, y, 66 + n * 0.5, 120 + n, 48 + n * 0.5);
    }
    // Two leaf blades off the stem.
    for (const [lx, ly] of [
      [5, 11], [4, 12], [9, 10], [10, 11],
    ] as const) {
      const n = jitter(rng, 12);
      set(lx, ly, 78 + n, 140 + n, 54 + n * 0.5);
    }
    // A round bloom: a ring of petals (darker rim) around a bright core,
    // centred near the top of the stem — reads as a real flower head.
    const cx = 7;
    const cy = 4;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > 3.2) continue;
        const n = jitter(rng, 20);
        if (d > 2.0) {
          set(cx + dx, cy + dy, pr * 0.8 + n, pg * 0.8 + n * 0.8, pb * 0.8 + n * 0.5); // petal rim
        } else if (d > 1.0) {
          set(cx + dx, cy + dy, pr + n, pg + n * 0.8, pb + n * 0.5); // petal body
        } else {
          set(cx + dx, cy + dy, cr + n * 0.5, cg + n * 0.5, cb + n * 0.5); // core
        }
      }
    }
  };
}

/** A carved stone idol on a transparent tile: a totem face with a violet gem. */
const paintSovereignTotem: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  // A tapered stone pillar.
  for (let y = 1; y <= 14; y++) {
    const inset = y < 3 ? 4 : y > 12 ? 5 : 3;
    for (let x = inset; x < TILE_PX - inset; x++) {
      const n = jitter(rng, 18);
      set(x, y, 92 + n, 88 + n, 98 + n); // violet-grey stone
    }
  }
  // Carved eyes + mouth (dark) and a violet gem in the brow.
  for (const [ex, ey] of [[6, 6], [9, 6], [6, 10], [9, 10]] as const) set(ex, ey, 30, 26, 34);
  for (let x = 6; x <= 9; x++) set(x, 12, 34, 28, 38);
  set(7, 3, 150, 96, 220);
  set(8, 3, 168, 110, 236);
};

/** A greataxe: long dark haft crowned by a broad violet-edged axe head. */
const paintKingsplitter: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  // Haft from bottom-left to upper area.
  for (let i = 2; i <= 13; i++) {
    const n = jitter(rng, 10);
    set(i, 15 - i, 96 + n, 72 + n * 0.7, 44 + n * 0.5);
    set(i + 1, 15 - i, 78 + n, 58 + n * 0.7, 36 + n * 0.5);
  }
  // Broad double-bit head near the top.
  for (let y = 1; y <= 7; y++) {
    for (let x = 8; x <= 14; x++) {
      const edge = x >= 13 || x <= 8;
      const n = jitter(rng, 16);
      if (Math.abs(y - 4) + Math.abs(x - 11) > 6) continue;
      set(x, y, (edge ? 150 : 70) + n, (edge ? 110 : 74) + n, (edge ? 220 : 86) + n); // violet edge, dark body
    }
  }
};

/** A golden crown with three gem-tipped points on a transparent tile. */
const paintCrown: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  // Band.
  for (let x = 3; x <= 12; x++) {
    for (let y = 9; y <= 12; y++) {
      const n = jitter(rng, 18);
      set(x, y, 226 + n, 190 + n, 74 + n * 0.5);
    }
  }
  // Three points rising from the band.
  for (const px of [3, 7, 11]) {
    for (let y = 5; y <= 9; y++) {
      const n = jitter(rng, 16);
      set(px, y, 232 + n, 198 + n, 82 + n * 0.5);
      set(px + 1, y, 214 + n, 178 + n, 70 + n * 0.5);
    }
  }
  // Gem tips.
  set(3, 4, 150, 96, 220);
  set(7, 4, 226, 90, 110);
  set(11, 4, 96, 190, 224);
};

/** The Monarch's throne: obsidian shot through with a molten cross of seams. */
const paintEmberthrone: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const n = jitter(rng, 8);
      set(x, y, 22 + n, 20 + n, 28 + n);
    }
  }
  // Molten seams: a vertical and horizontal fissure with a blazing meeting.
  for (let y = 1; y <= 14; y++) {
    const hot = Math.abs(y - 8) < 3;
    set(7, y, hot ? 255 : 214, hot ? 150 : 96, hot ? 56 : 40);
    set(8, y, hot ? 236 : 186, hot ? 120 : 76, 44);
  }
  for (let x = 2; x <= 13; x++) {
    const hot = Math.abs(x - 8) < 3;
    set(x, 8, hot ? 255 : 214, hot ? 150 : 96, hot ? 56 : 40);
  }
  set(7, 8, 255, 214, 120);
  set(8, 8, 255, 214, 120);
};

/** The Nightsever: a long night-black blade with a burning ember edge. */
const paintNightsever: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  // A long diagonal blade from top-right to the low guard.
  for (let i = 0; i < 11; i++) {
    const x = 14 - i;
    const y = 1 + i;
    const n = jitter(rng, 8);
    set(x, y, 24 + n, 20 + n, 32 + n); // night-black body
    set(x + 1, y, 255, 138 + n, 48); // ember edge
  }
  // Guard, grip, ember pommel.
  set(4, 11, 90, 70, 100);
  set(3, 12, 90, 70, 100);
  set(5, 12, 90, 70, 100);
  set(3, 13, 46, 36, 30);
  set(2, 14, 46, 36, 30);
  set(1, 15, 255, 150, 56);
};

/** The ash crown: a dark circlet with three burning ember points. */
const paintAshcrown: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  for (let x = 3; x <= 12; x++) {
    for (let y = 9; y <= 12; y++) {
      const n = jitter(rng, 10);
      set(x, y, 44 + n, 38 + n, 50 + n);
    }
  }
  for (const px of [3, 7, 11]) {
    for (let y = 5; y <= 9; y++) {
      const n = jitter(rng, 10);
      set(px, y, 52 + n, 44 + n, 58 + n);
      set(px + 1, y, 40 + n, 34 + n, 46 + n);
    }
    set(px, 4, 255, 150, 56); // burning tips
  }
};

/** The shrine altar: near-black stone etched with a glowing violet rune ring. */
const paintAltar: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const n = jitter(rng, 10);
      set(x, y, 30 + n, 27 + n, 38 + n);
    }
  }
  // A glowing violet rune: a diamond ring around a hot centre.
  const rune = (x: number, y: number, hot: boolean): void => {
    set(x, y, hot ? 212 : 148, hot ? 168 : 96, hot ? 255 : 224);
  };
  for (let i = 0; i <= 4; i++) {
    rune(7 - i, 3 + i, false);
    rune(8 + i, 3 + i, false);
    rune(7 - i, 12 - i, false);
    rune(8 + i, 12 - i, false);
  }
  rune(7, 7, true);
  rune(8, 7, true);
  rune(7, 8, true);
  rune(8, 8, true);
};

/** The Tyrant's eye: a pale orb with a violet iris on a transparent tile. */
const paintTyrantEye: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  for (let y = 3; y <= 12; y++) {
    for (let x = 3; x <= 12; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 4.6) continue;
      const n = jitter(rng, 8);
      if (d < 1.6) set(x, y, 40, 30, 60); // pupil
      else if (d < 3) set(x, y, 150 + n, 96 + n, 220 + n); // violet iris
      else set(x, y, 236 + n, 232 + n, 244 + n); // pale sclera
    }
  }
  set(6, 5, 255, 255, 255); // glint
};

/** A heartstone: a rosy crystal heart shot through with a bright core. */
const paintHeartstone: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  for (let y = 3; y <= 13; y++) {
    for (let x = 2; x <= 13; x++) {
      const cx = x - 7.5;
      const lobe = Math.min(Math.hypot(cx + 2.4, y - 5.5), Math.hypot(cx - 2.4, y - 5.5));
      const taper = Math.abs(cx) * 1.2 + (y - 5);
      if (lobe > 3 && (y < 6 || taper > 8.4)) continue;
      const n = jitter(rng, 14);
      set(x, y, 224 + n * 0.5, 76 + n, 108 + n);
    }
  }
  // Bright crystalline core.
  set(7, 7, 255, 168, 190);
  set(8, 7, 255, 168, 190);
  set(7, 8, 255, 140, 168);
  set(6, 6, 255, 196, 210);
};

/** A jagged ember shard: molten amber crystal splinter on a transparent tile. */
const paintEmberShard: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  // A slanted splinter from bottom-left to top-right, hot core, darker rim.
  for (let i = 0; i < 10; i++) {
    const x = 3 + i;
    const y = 12 - i;
    const n = jitter(rng, 14);
    set(x, y, 255, 150 + n, 52);
    set(x + 1, y, 236 + n * 0.3, 120 + n, 44);
    if (i % 3 === 1) set(x, y - 1, 255, 196, 96); // white-hot glints
  }
  set(4, 13, 176, 84, 36);
  set(12, 3, 176, 84, 36);
};

/** The duskblade: a slim violet-dark sword with a bright edge and gem pommel. */
const paintDuskblade: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  // Blade: a diagonal from upper-right down to the guard.
  for (let i = 0; i < 9; i++) {
    const x = 13 - i;
    const y = 2 + i;
    const n = jitter(rng, 10);
    set(x, y, 96 + n, 82 + n, 152 + n); // dark violet body
    set(x + 1, y, 168 + n, 156 + n, 224 + n); // bright edge
  }
  // Guard and grip.
  set(5, 10, 138, 122, 200);
  set(4, 11, 138, 122, 200);
  set(6, 11, 138, 122, 200);
  set(3, 12, 70, 54, 40); // leather grip
  set(2, 13, 70, 54, 40);
  set(1, 14, 150, 96, 220); // gem pommel
};

/** A cracked stone heart with a molten amber core burning through the seams. */
const paintTitanHeart: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  // Heart silhouette in weathered granite: two lobes tapering to a point.
  for (let y = 3; y <= 13; y++) {
    for (let x = 2; x <= 13; x++) {
      const cx = x - 7.5;
      const lobe = Math.min(Math.hypot(cx + 2.5, y - 5.5), Math.hypot(cx - 2.5, y - 5.5));
      const taper = Math.abs(cx) * 1.15 + (y - 5);
      if (lobe > 3.2 && (y < 6 || taper > 8.6)) continue;
      const n = jitter(rng, 14);
      set(x, y, 104 + n, 100 + n, 90 + n);
    }
  }
  // Molten core and glowing cracks.
  for (const [gx, gy] of [[7, 7], [8, 7], [7, 8], [8, 8], [6, 8], [9, 7]] as const) {
    set(gx, gy, 255, 176, 64);
  }
  set(5, 6, 236, 140, 52);
  set(10, 9, 236, 140, 52);
  set(8, 10, 224, 120, 48);
  set(7, 11, 210, 104, 44);
};

/** The earthshaker: a colossal granite maul head on a thick mossbound haft. */
const paintEarthshaker: TilePainter = (set, rng) => {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) set(x, y, 0, 0, 0, 0);
  }
  // Haft from bottom-left toward the head, wrapped in moss at the grip.
  for (let i = 1; i <= 11; i++) {
    const n = jitter(rng, 10);
    const mossy = i <= 4;
    set(i, 15 - i, mossy ? 70 + n : 96 + n, mossy ? 104 + n : 76 + n * 0.7, mossy ? 52 + n : 48 + n * 0.5);
    set(i + 1, 15 - i, mossy ? 58 + n : 80 + n, mossy ? 88 + n : 62 + n * 0.7, mossy ? 44 + n : 40 + n * 0.5);
  }
  // Massive squared granite head with an amber-lit striking face.
  for (let y = 0; y <= 6; y++) {
    for (let x = 8; x <= 15; x++) {
      const n = jitter(rng, 16);
      const edge = x >= 14 || y <= 1;
      set(x, y, (edge ? 128 : 100) + n, (edge ? 124 : 96) + n, (edge ? 112 : 86) + n);
    }
  }
  set(14, 3, 255, 176, 64);
  set(15, 3, 236, 140, 52);
  set(14, 4, 236, 140, 52);
};

const PAINTERS: ReadonlyArray<readonly [number, string, TilePainter]> = [
  [Tiles.stone, 'stone', paintStone],
  [Tiles.dirt, 'dirt', paintDirt],
  [Tiles.grassTop, 'grassTop', paintGrassTop],
  [Tiles.grassSide, 'grassSide', paintGrassSide],
  [Tiles.sand, 'sand', paintSand],
  [Tiles.water, 'water', paintWater],
  [Tiles.logSide, 'logSide', paintLogSide],
  [Tiles.logTop, 'logTop', paintLogTop],
  [Tiles.leaves, 'leaves', paintLeaves],
  [Tiles.planks, 'planks', paintPlanks],
  [Tiles.cobble, 'cobble', paintCobble],
  [Tiles.glass, 'glass', paintGlass],
  [Tiles.snow, 'snow', paintSnow],
  [Tiles.bedrock, 'bedrock', paintBedrock],
  [Tiles.brick, 'brick', paintBrick],
  [Tiles.ore, 'ore', paintOre],
  [Tiles.stick, 'stick', paintStick],
  [Tiles.woodPickaxe, 'woodPickaxe', paintPickaxe(150, 112, 66)],
  [Tiles.stonePickaxe, 'stonePickaxe', paintPickaxe(128, 128, 130)],
  [Tiles.ironPickaxe, 'ironPickaxe', paintPickaxe(208, 204, 200)],
  [Tiles.meat, 'meat', paintMeat],
  [Tiles.furnaceSide, 'furnaceSide', paintFurnaceSide],
  [Tiles.furnaceFront, 'furnaceFront', paintFurnaceFront],
  [Tiles.chestSide, 'chestSide', paintChestSide],
  [Tiles.chestTop, 'chestTop', paintChestTop],
  [Tiles.charcoal, 'charcoal', paintCharcoal],
  [Tiles.ingot, 'ingot', paintIngot],
  [Tiles.coalOre, 'coalOre', paintOreTile(46, 44, 50)],
  [Tiles.copperOre, 'copperOre', paintOreTile(196, 118, 70)],
  [Tiles.goldOre, 'goldOre', paintOreTile(224, 190, 70)],
  [Tiles.coal, 'coal', paintLump(40, 38, 44, 96)],
  [Tiles.copperIngot, 'copperIngot', paintBar(196, 122, 78, 234, 168, 120)],
  [Tiles.goldIngot, 'goldIngot', paintBar(226, 194, 78, 248, 232, 150)],
  [Tiles.copperPickaxe, 'copperPickaxe', paintPickaxe(196, 122, 78)],
  [Tiles.goldPickaxe, 'goldPickaxe', paintPickaxe(226, 194, 78)],
  [Tiles.ashstone, 'ashstone', paintAshstone],
  [Tiles.emberrock, 'emberrock', paintEmberrock],
  [Tiles.riftframe, 'riftframe', paintRiftframe],
  [Tiles.geodeshell, 'geodeshell', paintGeodeShell],
  [Tiles.crystal, 'crystal', paintCrystal],
  [Tiles.gem, 'gem', paintGem],
  [Tiles.gemPickaxe, 'gemPickaxe', paintPickaxe(150, 120, 220)],
  [Tiles.sapling, 'sapling', paintSapling],
  [Tiles.cookedMeat, 'cookedMeat', paintCookedMeat],
  [Tiles.lantern, 'lantern', paintLantern],
  [Tiles.ironVest, 'ironVest', paintVest(184, 188, 198)],
  [Tiles.goldVest, 'goldVest', paintVest(226, 194, 78)],
  [Tiles.gemVest, 'gemVest', paintVest(150, 120, 220)],
  [Tiles.bedTop, 'bedTop', paintBedTop],
  [Tiles.bedSide, 'bedSide', paintBedSide],
  [Tiles.throwingStone, 'throwingStone', paintLump(120, 122, 128, 168)],
  [Tiles.bucket, 'bucket', paintBucket(0, 0, 0, false)],
  [Tiles.waterBucket, 'waterBucket', paintBucket(52, 110, 198, true)],
  [Tiles.torch, 'torch', paintTorch],
  [Tiles.farmland, 'farmland', paintFarmland],
  [Tiles.cropSprout, 'cropSprout', paintCrop(0)],
  [Tiles.cropGrowing, 'cropGrowing', paintCrop(1)],
  [Tiles.cropRipe, 'cropRipe', paintCrop(2)],
  [Tiles.seeds, 'seeds', paintSeeds],
  [Tiles.grain, 'grain', paintGrain],
  [Tiles.bread, 'bread', paintBread],
  [Tiles.hoe, 'hoe', paintHoe],
  [Tiles.crack0, 'crack0', paintCrack(0)],
  [Tiles.crack1, 'crack1', paintCrack(1)],
  [Tiles.crack2, 'crack2', paintCrack(2)],
  [Tiles.crack3, 'crack3', paintCrack(3)],
  [Tiles.coralRose, 'coralRose', paintCoral(236, 92, 138)],
  [Tiles.coralTeal, 'coralTeal', paintCoral(56, 204, 194)],
  [Tiles.seagrass, 'seagrass', paintSeagrass],
  [Tiles.glowmoss, 'glowmoss', paintGlowmoss],
  [Tiles.mossstone, 'mossstone', paintMossstone],
  [Tiles.glowbloom, 'glowbloom', paintGlowbloom],
  [Tiles.cindercap, 'cindercap', paintCindercap],
  [Tiles.wildgrass, 'wildgrass', paintWildgrass],
  [Tiles.sunwisp, 'sunwisp', paintFlower(238, 206, 64, 178, 118, 32)],
  [Tiles.duskbell, 'duskbell', paintFlower(104, 92, 208, 226, 232, 255)],
  [Tiles.sovereignTotem, 'sovereignTotem', paintSovereignTotem],
  [Tiles.kingsplitter, 'kingsplitter', paintKingsplitter],
  [Tiles.crown, 'crown', paintCrown],
  [Tiles.titanHeart, 'titanHeart', paintTitanHeart],
  [Tiles.earthshaker, 'earthshaker', paintEarthshaker],
  [Tiles.silverOre, 'silverOre', paintOreTile(212, 216, 228)],
  [Tiles.duskOre, 'duskOre', paintOreTile(104, 86, 168)],
  [Tiles.emberOre, 'emberOre', paintOreTile(255, 138, 46)],
  [Tiles.silverIngot, 'silverIngot', paintBar(208, 212, 224, 242, 246, 252)],
  [Tiles.duskIngot, 'duskIngot', paintBar(92, 78, 148, 138, 122, 200)],
  [Tiles.emberShard, 'emberShard', paintEmberShard],
  [Tiles.silverVest, 'silverVest', paintVest(212, 216, 228)],
  [Tiles.duskVest, 'duskVest', paintVest(112, 96, 176)],
  [Tiles.duskblade, 'duskblade', paintDuskblade],
  [Tiles.altar, 'altar', paintAltar],
  [Tiles.tyrantEye, 'tyrantEye', paintTyrantEye],
  [Tiles.heartstone, 'heartstone', paintHeartstone],
  [Tiles.emberthrone, 'emberthrone', paintEmberthrone],
  [Tiles.ashbloom, 'ashbloom', paintFlower(224, 62, 58, 255, 176, 64)],
  [Tiles.nightsever, 'nightsever', paintNightsever],
  [Tiles.ashcrown, 'ashcrown', paintAshcrown],
];

/**
 * Bakes simple directional lighting into one 16x16 tile of the atlas, in
 * place, and only if the tile is fully opaque (all 256 pixels at alpha 255 —
 * this automatically skips water, glass, leaves, cracks and item sprites):
 * - a vertical light gradient, multiplying RGB by 1.08 at row 0 fading
 *   linearly to 0.92 at row 15, as if lit from above;
 * - a bevel, brightening the top rows 0-1 and left column 0 by a further
 *   +10% and darkening the bottom rows 14-15 and right column 15 by -12%,
 *   so each block face pops out of the wall.
 * Channels are clamped to [0, 255]; alpha is untouched. Pure and RNG-free,
 * so the post-pass preserves atlas determinism.
 */
function shadeOpaqueTile(px: Uint8ClampedArray, ox: number, oy: number): void {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      if (px[((oy + y) * ATLAS_PX + (ox + x)) * 4 + 3] !== 255) return;
    }
  }
  for (let y = 0; y < TILE_PX; y++) {
    const gradient = 1.08 - 0.16 * (y / (TILE_PX - 1));
    for (let x = 0; x < TILE_PX; x++) {
      let f = gradient;
      if (y <= 1 || x === 0) f *= 1.1;
      if (y >= TILE_PX - 2 || x === TILE_PX - 1) f *= 0.88;
      const o = ((oy + y) * ATLAS_PX + (ox + x)) * 4;
      for (let c = 0; c < 3; c++) {
        px[o + c] = Math.max(0, Math.min(255, Math.round((px[o + c] ?? 0) * f)));
      }
    }
  }
}

/**
 * Pure atlas generation: RGBA pixels for the full 256x256 atlas. Each tile
 * draws from its own (seed, tileName) PRNG stream, so output is deterministic
 * and independent of paint order. A final RNG-free post-pass bakes a vertical
 * light gradient and edge bevel into every fully opaque tile.
 */
export function generateAtlasPixels(seed: string): Uint8ClampedArray {
  const px = new Uint8ClampedArray(ATLAS_PX * ATLAS_PX * 4);
  for (const [tile, name, paint] of PAINTERS) {
    const ox = (tile % ATLAS_TILES) * TILE_PX;
    const oy = Math.floor(tile / ATLAS_TILES) * TILE_PX;
    const set = (x: number, y: number, r: number, g: number, b: number, a = 255): void => {
      const o = ((oy + y) * ATLAS_PX + (ox + x)) * 4;
      px[o] = r;
      px[o + 1] = g;
      px[o + 2] = b;
      px[o + 3] = a;
    };
    paint(set, rngFromSeed(seed, `tile:${name}`));
  }
  for (let tile = 0; tile < ATLAS_TILES * ATLAS_TILES; tile++) {
    shadeOpaqueTile(px, (tile % ATLAS_TILES) * TILE_PX, Math.floor(tile / ATLAS_TILES) * TILE_PX);
  }
  return px;
}

/** Blit the atlas pixels onto a canvas (DOM side, not used by tests). */
export function createAtlasCanvas(seed: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_PX;
  canvas.height = ATLAS_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.putImageData(new ImageData(generateAtlasPixels(seed), ATLAS_PX, ATLAS_PX), 0, 0);
  return canvas;
}

/**
 * UV rectangle for a tile. Canvas textures flip Y (v=0 is the canvas bottom),
 * so the v range is computed from the bottom edge.
 */
export function tileUVRect(tile: number): { u0: number; v0: number; u1: number; v1: number } {
  const tx = tile % ATLAS_TILES;
  const ty = Math.floor(tile / ATLAS_TILES);
  return {
    u0: tx / ATLAS_TILES,
    v0: (ATLAS_TILES - 1 - ty) / ATLAS_TILES,
    u1: (tx + 1) / ATLAS_TILES,
    v1: (ATLAS_TILES - ty) / ATLAS_TILES,
  };
}
