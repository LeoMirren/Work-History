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
  [Tiles.lantern, 'lantern', paintLantern],
];

/**
 * Pure atlas generation: RGBA pixels for the full 256x256 atlas. Each tile
 * draws from its own (seed, tileName) PRNG stream, so output is deterministic
 * and independent of paint order.
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
