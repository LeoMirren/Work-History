/**
 * Block registry (§4.2). Readable definitions compile into flat typed-array
 * lookup tables for the hot paths (meshing, collision).
 */
import { Tiles } from '../engine/atlas';

export const Block = {
  air: 0,
  stone: 1,
  dirt: 2,
  grass: 3,
  sand: 4,
  water: 5,
  log: 6,
  leaves: 7,
  planks: 8,
  cobblestone: 9,
  glass: 10,
  snow: 11,
  bedrock: 12,
  brick: 13,
  ore: 14,
  furnace: 15,
  chest: 16,
  lantern: 17,
  coalOre: 18,
  copperOre: 19,
  goldOre: 20,
  ashstone: 21,
  emberrock: 22,
  riftframe: 23,
  geodeshell: 24,
  crystal: 25,
  bed: 26,
  torch: 27,
  farmland: 28,
  cropSprout: 29,
  cropGrowing: 30,
  cropRipe: 31,
} as const;

export type BlockName = keyof typeof Block;

/** Render-pass / opacity classes. */
export const PASS_NONE = 0;
export const PASS_OPAQUE = 1;
export const PASS_CUTOUT = 2;
export const PASS_TRANSLUCENT = 3;

export interface BlockDef {
  readonly id: number;
  readonly name: BlockName;
  readonly solid: boolean;
  readonly pass: number;
  readonly breakable: boolean;
  /** Survival break time in seconds (Infinity = unbreakable). */
  readonly breakTime: number;
  /** Tile indices per face, ordered [+x, -x, +y(top), -y(bottom), +z, -z]. */
  readonly tiles: readonly [number, number, number, number, number, number];
}

function tiles(side: number, top = side, bottom = top): BlockDef['tiles'] {
  return [side, side, top, bottom, side, side];
}

const T = Tiles;

export const BLOCK_DEFS: readonly BlockDef[] = [
  { id: Block.air, name: 'air', solid: false, pass: PASS_NONE, breakable: false, breakTime: 0, tiles: tiles(0) },
  { id: Block.stone, name: 'stone', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 2.25, tiles: tiles(T.stone) },
  { id: Block.dirt, name: 'dirt', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 0.75, tiles: tiles(T.dirt) },
  { id: Block.grass, name: 'grass', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 0.9, tiles: tiles(T.grassSide, T.grassTop, T.dirt) },
  { id: Block.sand, name: 'sand', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 0.75, tiles: tiles(T.sand) },
  { id: Block.water, name: 'water', solid: false, pass: PASS_TRANSLUCENT, breakable: false, breakTime: 0, tiles: tiles(T.water) },
  { id: Block.log, name: 'log', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 1.5, tiles: tiles(T.logSide, T.logTop, T.logTop) },
  { id: Block.leaves, name: 'leaves', solid: true, pass: PASS_CUTOUT, breakable: true, breakTime: 0.3, tiles: tiles(T.leaves) },
  { id: Block.planks, name: 'planks', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 1.5, tiles: tiles(T.planks) },
  { id: Block.cobblestone, name: 'cobblestone', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 2.25, tiles: tiles(T.cobble) },
  { id: Block.glass, name: 'glass', solid: true, pass: PASS_CUTOUT, breakable: true, breakTime: 0.4, tiles: tiles(T.glass) },
  { id: Block.snow, name: 'snow', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 0.3, tiles: tiles(T.snow) },
  { id: Block.bedrock, name: 'bedrock', solid: true, pass: PASS_OPAQUE, breakable: false, breakTime: Infinity, tiles: tiles(T.bedrock) },
  { id: Block.brick, name: 'brick', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 2.25, tiles: tiles(T.brick) },
  { id: Block.ore, name: 'ore', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 3, tiles: tiles(T.ore) },
  { id: Block.furnace, name: 'furnace', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 2.5, tiles: tiles(T.furnaceSide, T.furnaceSide, T.furnaceFront) },
  { id: Block.chest, name: 'chest', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 1.5, tiles: tiles(T.chestSide, T.chestTop, T.chestTop) },
  { id: Block.lantern, name: 'lantern', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 0.3, tiles: tiles(T.lantern) },
  { id: Block.coalOre, name: 'coalOre', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 3, tiles: tiles(T.coalOre) },
  { id: Block.copperOre, name: 'copperOre', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 3, tiles: tiles(T.copperOre) },
  { id: Block.goldOre, name: 'goldOre', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 3.5, tiles: tiles(T.goldOre) },
  { id: Block.ashstone, name: 'ashstone', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 2.4, tiles: tiles(T.ashstone) },
  { id: Block.emberrock, name: 'emberrock', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 2.6, tiles: tiles(T.emberrock) },
  { id: Block.riftframe, name: 'riftframe', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 4, tiles: tiles(T.riftframe) },
  { id: Block.geodeshell, name: 'geodeshell', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 3, tiles: tiles(T.geodeshell) },
  { id: Block.crystal, name: 'crystal', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 2.4, tiles: tiles(T.crystal) },
  { id: Block.bed, name: 'bed', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 0.4, tiles: tiles(T.bedSide, T.bedTop, T.planks) },
  { id: Block.torch, name: 'torch', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 0.1, tiles: tiles(T.torch) },
  { id: Block.farmland, name: 'farmland', solid: true, pass: PASS_OPAQUE, breakable: true, breakTime: 0.75, tiles: tiles(T.dirt, T.farmland, T.dirt) },
  // Crops are walk-through cutout blocks; the growth stage IS the block id.
  { id: Block.cropSprout, name: 'cropSprout', solid: false, pass: PASS_CUTOUT, breakable: true, breakTime: 0.05, tiles: tiles(T.cropSprout) },
  { id: Block.cropGrowing, name: 'cropGrowing', solid: false, pass: PASS_CUTOUT, breakable: true, breakTime: 0.05, tiles: tiles(T.cropGrowing) },
  { id: Block.cropRipe, name: 'cropRipe', solid: false, pass: PASS_CUTOUT, breakable: true, breakTime: 0.05, tiles: tiles(T.cropRipe) },
];

/** Flat lookup tables indexed by block id (256 slots; unknown ids are air-like). */
export const SOLID = new Uint8Array(256);
export const OPAQUE = new Uint8Array(256);
export const PASS = new Uint8Array(256);
export const BREAKABLE = new Uint8Array(256);
export const BREAK_TIME = new Float32Array(256);
/** Block-light emission 0-15 (lighting engine sources). */
export const LIGHT_EMIT = new Uint8Array(256);
export const FACE_TILES = new Int32Array(256 * 6);

for (const def of BLOCK_DEFS) {
  SOLID[def.id] = def.solid ? 1 : 0;
  OPAQUE[def.id] = def.pass === PASS_OPAQUE ? 1 : 0;
  PASS[def.id] = def.pass;
  BREAKABLE[def.id] = def.breakable ? 1 : 0;
  BREAK_TIME[def.id] = def.breakTime;
  for (let f = 0; f < 6; f++) FACE_TILES[def.id * 6 + f] = def.tiles[f] ?? 0;
}
LIGHT_EMIT[Block.lantern] = 14;
LIGHT_EMIT[Block.torch] = 12; // cheaper, dimmer early-game light
LIGHT_EMIT[Block.emberrock] = 10;
LIGHT_EMIT[Block.crystal] = 7;

/** Default creative hotbar (§4.2). */
export const HOTBAR_BLOCKS: readonly number[] = [
  Block.stone,
  Block.dirt,
  Block.grass,
  Block.sand,
  Block.planks,
  Block.cobblestone,
  Block.glass,
  Block.log,
  Block.lantern,
];

export function blockName(id: number): string {
  const name = BLOCK_DEFS[id]?.name;
  if (!name) return 'unknown';
  // Humanize camelCase registry keys for display (coalOre -> "coal ore").
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}
