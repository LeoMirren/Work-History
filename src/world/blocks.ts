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
];

/** Flat lookup tables indexed by block id (256 slots; unknown ids are air-like). */
export const SOLID = new Uint8Array(256);
export const OPAQUE = new Uint8Array(256);
export const PASS = new Uint8Array(256);
export const BREAKABLE = new Uint8Array(256);
export const BREAK_TIME = new Float32Array(256);
export const FACE_TILES = new Int32Array(256 * 6);

for (const def of BLOCK_DEFS) {
  SOLID[def.id] = def.solid ? 1 : 0;
  OPAQUE[def.id] = def.pass === PASS_OPAQUE ? 1 : 0;
  PASS[def.id] = def.pass;
  BREAKABLE[def.id] = def.breakable ? 1 : 0;
  BREAK_TIME[def.id] = def.breakTime;
  for (let f = 0; f < 6; f++) FACE_TILES[def.id * 6 + f] = def.tiles[f] ?? 0;
}

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
  Block.brick,
];

export function blockName(id: number): string {
  return BLOCK_DEFS[id]?.name ?? 'unknown';
}
