/**
 * Pure chunk mesher (§4.5, §4.6) + light baking. Input is a 48×128×48
 * snapshot — the meshed chunk centered in its full 3×3 neighborhood — so both
 * face culling and 15-block light propagation see everything they need with
 * no world access. Runs identically in a worker or on the main thread.
 *
 * Emits up to three passes (opaque / cutout / translucent water). Per vertex:
 *  - color: directional face shade × warm/cool face grade × ambient occlusion
 *    × foliage tint × per-column jitter (see COLOR GRADING below) — all baked
 *    at mesh time, zero per-frame cost;
 *  - light: (sky, block) channels 0..1, smoothed over the four cells meeting
 *    at the vertex (the same cells AO samples). The shader combines them with
 *    the day/night brightness so lanterns keep glowing at night.
 */
import { Block, FACE_TILES, OPAQUE, PASS, PASS_CUTOUT, PASS_NONE, PASS_OPAQUE } from './blocks';
import { CHUNK_HEIGHT, CHUNK_SIZE } from './chunk';
import { computeLight, MAX_LIGHT, snapIndex } from './lighting';
import { hash2 } from './noise';
import { ATLAS_TILES } from '../engine/atlas';

/** The meshed chunk occupies snapshot cells [CENTER, CENTER+16). */
export const CENTER = CHUNK_SIZE;

/** §4.6: corner AO level 0..3 from the three neighboring occluders. */
export function computeAO(side1: boolean, side2: boolean, corner: boolean): number {
  if (side1 && side2) return 0;
  return 3 - ((side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0));
}

/* ---------------------------------------------------------------------------
 * COLOR GRADING — every vertex-color tuning constant lives in this block.
 * Baked into the `color` attribute at mesh time (shader: albedo × color ×
 * light), so all values are multipliers around 1 and cost nothing per frame.
 *
 * AO_BRIGHTNESS     brightness per §4.6 AO level [0..3]. Level 0 deepened
 *                   0.50 → 0.45 for crisper corners/crevices; levels 1..3
 *                   unchanged so open faces keep their look.
 * FACE_SHADE        scalar directional shade per face [+x,-x,+y,-y,+z,-z]
 *                   (§4.5). Bottoms dropped 0.55 → 0.50 so overhangs and
 *                   cave ceilings read heavier against the warm tops.
 * FACE_GRADE_RG/_B  warm/cool chroma per face: tops +3% warm (sun-heated),
 *                   east/west (±x) +3% blue (cool sky fill), north/south and
 *                   bottoms neutral. Warmth rides the yellow–blue axis: red
 *                   and green move TOGETHER (RG) against blue (B), so r === g
 *                   holds on untinted blocks — only foliageTint may separate
 *                   them (the "tints grass but never stone" invariant pinned
 *                   by graphics.test.ts).
 * JITTER_*          deterministic per-world-column color jitter from hash2:
 *                   two octaves (16- and 4-block strides) averaged into one
 *                   smooth value per column — patches, never checkerboards.
 *                   Grass/leaves ±5% green (meadow patchiness), water ±3%
 *                   blue, stone/sand/snow ±2% on all channels (uniform, so
 *                   the r === g invariant survives). Other blocks: none.
 * TINT_*            existing per-patch foliage tint (±6% r / ±8% b), kept
 *                   as-is; multiplies on top of the grade and jitter.
 * ------------------------------------------------------------------------- */

export const AO_BRIGHTNESS: readonly number[] = [0.45, 0.7, 0.85, 1.0];

/** Directional shade per face, order [+x, -x, +y, -y, +z, -z] (§4.5). */
export const FACE_SHADE: readonly number[] = [0.75, 0.75, 1.0, 0.5, 0.85, 0.85];

/** Warm/cool grade: red+green multiplier per face (warm tops). */
export const FACE_GRADE_RG: readonly number[] = [1.0, 1.0, 1.03, 1.0, 1.0, 1.0];

/** Warm/cool grade: blue multiplier per face (cool east/west sides). */
export const FACE_GRADE_B: readonly number[] = [1.03, 1.03, 1.0, 1.0, 1.0, 1.0];

const JITTER_SALT_COARSE = 0x51ab3d; // 16-block octave: regional drift
const JITTER_SALT_FINE = 0x9c4e17; // 4-block octave: local patchiness
const JITTER_GREEN = 0.05; // grass + leaves green swing (spec: ±4–6%)
const JITTER_BLUE = 0.03; // water blue swing
const JITTER_MINERAL = 0.02; // stone/sand/snow all-channel swing
const JITTER_GREEN_IDS = new Set<number>([Block.grass, Block.leaves]);
const JITTER_MINERAL_IDS = new Set<number>([Block.stone, Block.sand, Block.snow]);

/** Foliage gets a subtle per-column warm/cool tint so plains aren't flat. */
const TINT_SALT = 0x7e11a9;
const TINTED = new Set<number>([Block.grass, Block.leaves]);

export function foliageTint(wx: number, wz: number): { r: number; b: number } {
  // 4-block patches; subtle ±6% red / ±8% blue swing around neutral.
  const h = hash2(TINT_SALT, wx >> 2, wz >> 2);
  return { r: 0.94 + ((h & 0xff) / 255) * 0.12, b: 0.88 + (((h >> 8) & 0xff) / 255) * 0.16 };
}

/**
 * One smooth deterministic value in [-1, 1] per world column: two hash
 * octaves at different strides, averaged, so patch borders of the two grids
 * never coincide (no checkerboard). `>>` floors correctly for negatives.
 */
function columnNoise(wx: number, wz: number): number {
  const coarse = hash2(JITTER_SALT_COARSE, wx >> 4, wz >> 4) / 0xffffffff;
  const fine = hash2(JITTER_SALT_FINE, wx >> 2, wz >> 2) / 0xffffffff;
  return coarse + fine - 1; // mean of two [0,1] values, rescaled to [-1, 1]
}

/**
 * Per-column color jitter multipliers for a block id (neutral {1,1,1} for
 * ids outside the three jitter classes). Exported so tests can compute
 * expected vertex colors exactly.
 */
export function columnJitter(id: number, wx: number, wz: number): { r: number; g: number; b: number } {
  if (JITTER_GREEN_IDS.has(id)) return { r: 1, g: 1 + columnNoise(wx, wz) * JITTER_GREEN, b: 1 };
  if (id === Block.water) return { r: 1, g: 1, b: 1 + columnNoise(wx, wz) * JITTER_BLUE };
  if (JITTER_MINERAL_IDS.has(id)) {
    const m = 1 + columnNoise(wx, wz) * JITTER_MINERAL;
    return { r: m, g: m, b: m };
  }
  return { r: 1, g: 1, b: 1 };
}

/**
 * Face tables. Order: 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z (matches FACE_TILES).
 * Corners are CCW seen from outside the block; uv corners match positionally,
 * with v tracking world +y on side faces so textures stand upright.
 */
export interface FaceDef {
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  readonly corners: ReadonlyArray<readonly [number, number, number]>;
  readonly uvs: ReadonlyArray<readonly [number, number]>;
}

export const FACES: readonly FaceDef[] = [
  {
    dx: 1, dy: 0, dz: 0,
    corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
    uvs: [[0, 0], [0, 1], [1, 1], [1, 0]],
  },
  {
    dx: -1, dy: 0, dz: 0,
    corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
    uvs: [[0, 0], [0, 1], [1, 1], [1, 0]],
  },
  {
    dx: 0, dy: 1, dz: 0,
    corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
    uvs: [[0, 0], [0, 1], [1, 1], [1, 0]],
  },
  {
    dx: 0, dy: -1, dz: 0,
    corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
    uvs: [[0, 0], [1, 0], [1, 1], [0, 1]],
  },
  {
    dx: 0, dy: 0, dz: 1,
    corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
    uvs: [[0, 0], [1, 0], [1, 1], [0, 1]],
  },
  {
    dx: 0, dy: 0, dz: -1,
    corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
    uvs: [[0, 0], [1, 0], [1, 1], [0, 1]],
  },
];

/**
 * Per-face, per-vertex sample offsets (side1/side2/corner) derived from the
 * face tables: one step along the normal, then toward the vertex corner along
 * each in-plane axis. Shared by AO (occlusion) and light smoothing.
 */
const FACE_AO: ReadonlyArray<ReadonlyArray<readonly number[]>> = FACES.map((face) => {
  const normal = [face.dx, face.dy, face.dz];
  const normalAxis = normal.findIndex((v) => v !== 0);
  const planeAxes = [0, 1, 2].filter((a) => a !== normalAxis);
  return face.corners.map((corner) => {
    const a = planeAxes[0] ?? 0;
    const b = planeAxes[1] ?? 0;
    const signA = corner[a] === 1 ? 1 : -1;
    const signB = corner[b] === 1 ? 1 : -1;
    const side1 = [...normal];
    side1[a] = (side1[a] ?? 0) + signA;
    const side2 = [...normal];
    side2[b] = (side2[b] ?? 0) + signB;
    const diag = [...normal];
    diag[a] = (diag[a] ?? 0) + signA;
    diag[b] = (diag[b] ?? 0) + signB;
    // Flattened [s1x,s1y,s1z, s2x,s2y,s2z, cx,cy,cz] for allocation-free reads.
    return [...side1, ...side2, ...diag] as readonly number[];
  });
});

export interface MeshArrays {
  positions: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  /** Per-vertex (sky, block) light, 0..1. */
  lights: Float32Array;
  indices: Uint32Array;
  /** Geometry extents in chunk-local coords, for bounding volumes. */
  bounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
}

export interface ChunkMeshData {
  opaque: MeshArrays | null;
  cutout: MeshArrays | null;
  water: MeshArrays | null;
}

class QuadSink {
  positions: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  lights: number[] = [];
  indices: number[] = [];
  minX = Infinity;
  minY = Infinity;
  minZ = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;
  maxZ = -Infinity;

  /**
   * vertexLight holds 8 floats: (sky, block) per corner, already 0..1.
   * colR/colG/colB are the face's combined chroma multipliers
   * (warm/cool grade × foliage tint × column jitter).
   */
  pushQuad(
    x: number,
    y: number,
    z: number,
    face: FaceDef,
    tile: number,
    shade: number,
    ao0: number,
    ao1: number,
    ao2: number,
    ao3: number,
    vertexLight: ArrayLike<number>,
    colR: number,
    colG: number,
    colB: number,
  ): void {
    const base = this.positions.length / 3;
    const tu = (tile % ATLAS_TILES) / ATLAS_TILES;
    const tv = (ATLAS_TILES - 1 - Math.floor(tile / ATLAS_TILES)) / ATLAS_TILES;
    for (let c = 0; c < 4; c++) {
      const corner = face.corners[c];
      const uv = face.uvs[c];
      if (!corner || !uv) continue;
      const vx = x + corner[0];
      const vy = y + corner[1];
      const vz = z + corner[2];
      this.positions.push(vx, vy, vz);
      this.uvs.push(tu + uv[0] / ATLAS_TILES, tv + uv[1] / ATLAS_TILES);
      const ao = c === 0 ? ao0 : c === 1 ? ao1 : c === 2 ? ao2 : ao3;
      const lit = shade * (AO_BRIGHTNESS[ao] ?? 1);
      this.colors.push(lit * colR, lit * colG, lit * colB);
      this.lights.push(vertexLight[c * 2] ?? 1, vertexLight[c * 2 + 1] ?? 0);
      if (vx < this.minX) this.minX = vx;
      if (vy < this.minY) this.minY = vy;
      if (vz < this.minZ) this.minZ = vz;
      if (vx > this.maxX) this.maxX = vx;
      if (vy > this.maxY) this.maxY = vy;
      if (vz > this.maxZ) this.maxZ = vz;
    }
    // §4.6 anisotropy fix: flip the diagonal when AO would smear wrong.
    if (ao0 + ao2 > ao1 + ao3) {
      this.indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    } else {
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  toArrays(): MeshArrays | null {
    if (this.indices.length === 0) return null;
    return {
      positions: Float32Array.from(this.positions),
      uvs: Float32Array.from(this.uvs),
      colors: Float32Array.from(this.colors),
      lights: Float32Array.from(this.lights),
      indices: Uint32Array.from(this.indices),
      bounds: {
        minX: this.minX,
        minY: this.minY,
        minZ: this.minZ,
        maxX: this.maxX,
        maxY: this.maxY,
        maxZ: this.maxZ,
      },
    };
  }
}

/**
 * Neighbor sample from the snapshot. Below the world reads as bedrock (culls
 * invisible undersides at y=0); above it as air.
 */
function sampleAt(snapshot: Uint8Array, sx: number, y: number, sz: number): number {
  if (y < 0) return Block.bedrock;
  if (y >= CHUNK_HEIGHT) return Block.air;
  return snapshot[snapIndex(sx, y, sz)] ?? 0;
}

/** Solid-opaque occluder test for AO (§4.6). */
function occludes(snapshot: Uint8Array, sx: number, y: number, sz: number): boolean {
  if (y < 0 || y >= CHUNK_HEIGHT) return false;
  return OPAQUE[snapshot[snapIndex(sx, y, sz)] ?? 0] === 1;
}

// Scratch for per-quad vertex light (8 floats), reused across calls.
const vertexLightScratch = new Float32Array(8);

/**
 * Mesh the center chunk of a 3×3 snapshot. Pure — (cx, cz) only seed the
 * deterministic foliage-tint and column-jitter hashes, so identical inputs
 * always produce byte-identical meshes.
 */
export function meshChunk(snapshot: Uint8Array, cx: number, cz: number): ChunkMeshData {
  const light = computeLight(snapshot);
  const opaque = new QuadSink();
  const cutout = new QuadSink();
  const water = new QuadSink();

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const sz = z + CENTER;
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const sx = x + CENTER;
        const id = snapshot[snapIndex(sx, y, sz)] ?? 0;
        const pass = PASS[id] ?? PASS_NONE;
        if (pass === PASS_NONE) continue;
        const sink = pass === PASS_OPAQUE ? opaque : pass === PASS_CUTOUT ? cutout : water;
        const wx = cx * CHUNK_SIZE + x;
        const wz = cz * CHUNK_SIZE + z;
        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          if (!face) continue;
          const nb = sampleAt(snapshot, sx + face.dx, y + face.dy, sz + face.dz);
          // §4.5 culling: emit iff the neighbor is non-opaque AND NOT
          // (same id and both non-opaque).
          if (OPAQUE[nb] === 1) continue;
          if (nb === id && OPAQUE[id] !== 1) continue;
          const aoTable = FACE_AO[f];
          let ao0 = 3;
          let ao1 = 3;
          let ao2 = 3;
          let ao3 = 3;
          for (let v = 0; v < 4; v++) {
            const o = aoTable?.[v];
            if (!o) continue;
            const s1 = occludes(snapshot, sx + (o[0] ?? 0), y + (o[1] ?? 0), sz + (o[2] ?? 0));
            const s2 = occludes(snapshot, sx + (o[3] ?? 0), y + (o[4] ?? 0), sz + (o[5] ?? 0));
            const co = occludes(snapshot, sx + (o[6] ?? 0), y + (o[7] ?? 0), sz + (o[8] ?? 0));
            const ao = computeAO(s1, s2, co);
            if (v === 0) ao0 = ao;
            else if (v === 1) ao1 = ao;
            else if (v === 2) ao2 = ao;
            else ao3 = ao;

            // Smooth light: average the lit cell + the three AO cells that
            // are transparent. Out-of-world above is full sky.
            let sky = 0;
            let blk = 0;
            let count = 0;
            for (let cell = 0; cell < 4; cell++) {
              const ox = cell === 0 ? face.dx : (o[(cell - 1) * 3] ?? 0);
              const oy = cell === 0 ? face.dy : (o[(cell - 1) * 3 + 1] ?? 0);
              const oz = cell === 0 ? face.dz : (o[(cell - 1) * 3 + 2] ?? 0);
              const lx = sx + ox;
              const ly = y + oy;
              const lz = sz + oz;
              if (ly >= CHUNK_HEIGHT) {
                sky += MAX_LIGHT;
                count++;
                continue;
              }
              if (ly < 0) continue;
              const li = snapIndex(lx, ly, lz);
              if (OPAQUE[snapshot[li] ?? 0] === 1) continue;
              sky += light.sky[li] ?? 0;
              blk += light.block[li] ?? 0;
              count++;
            }
            if (count === 0) {
              // Fully enclosed corner: fall back to the face's lit cell.
              const li = snapIndex(sx + face.dx, Math.min(CHUNK_HEIGHT - 1, Math.max(0, y + face.dy)), sz + face.dz);
              sky = light.sky[li] ?? 0;
              blk = light.block[li] ?? 0;
              count = 1;
            }
            vertexLightScratch[v * 2] = sky / count / MAX_LIGHT;
            vertexLightScratch[v * 2 + 1] = blk / count / MAX_LIGHT;
          }
          // Combined chroma per face: warm/cool grade × column jitter ×
          // foliage tint. r and g share the grade and (for minerals) the
          // jitter, so r === g on every untinted block.
          const jit = columnJitter(id, wx, wz);
          // "Grass tops/sides" only: the dirt underside skips green jitter.
          const jg = id === Block.grass && f === 3 ? 1 : jit.g;
          const gradeRG = FACE_GRADE_RG[f] ?? 1;
          let colR = gradeRG * jit.r;
          const colG = gradeRG * jg;
          let colB = (FACE_GRADE_B[f] ?? 1) * jit.b;
          if (TINTED.has(id)) {
            const tint = foliageTint(wx, wz);
            colR *= tint.r;
            colB *= tint.b;
          }
          sink.pushQuad(
            x, y, z, face, FACE_TILES[id * 6 + f] ?? 0, FACE_SHADE[f] ?? 1,
            ao0, ao1, ao2, ao3, vertexLightScratch, colR, colG, colB,
          );
        }
      }
    }
  }
  return { opaque: opaque.toArrays(), cutout: cutout.toArrays(), water: water.toArrays() };
}
