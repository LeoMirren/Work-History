/**
 * Pure chunk mesher (§4.5, §4.6). Input is a padded snapshot of one chunk
 * plus a 1-block border from its neighbors, so the function needs no world
 * access and runs identically on the main thread or in a worker.
 *
 * Padded layout: px,pz in [0,17] (local -1..16), y in [0,127];
 * index = px + pz*18 + y*324.
 *
 * Emits up to three passes (opaque / cutout / translucent water). Vertex
 * colors bake directional face shade × ambient occlusion; quads flip their
 * triangulation diagonal when AO is anisotropic.
 */
import { Block, FACE_TILES, OPAQUE, PASS, PASS_CUTOUT, PASS_NONE, PASS_OPAQUE } from './blocks';
import { CHUNK_HEIGHT, CHUNK_SIZE, blockIndex } from './chunk';
import { hash2 } from './noise';
import { ATLAS_TILES } from '../engine/atlas';

export const PAD = CHUNK_SIZE + 2; // 18
export const PADDED_VOLUME = PAD * PAD * CHUNK_HEIGHT;

export function paddedIndex(px: number, y: number, pz: number): number {
  return px + pz * PAD + y * PAD * PAD;
}

/** §4.6: corner AO level 0..3 from the three neighboring occluders. */
export function computeAO(side1: boolean, side2: boolean, corner: boolean): number {
  if (side1 && side2) return 0;
  return 3 - ((side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0));
}

export const AO_BRIGHTNESS: readonly number[] = [0.5, 0.7, 0.85, 1.0];

/** Directional shade per face, order [+x, -x, +y, -y, +z, -z] (§4.5). */
export const FACE_SHADE: readonly number[] = [0.75, 0.75, 1.0, 0.55, 0.85, 0.85];

/**
 * Fake depth lighting: faces darken with distance below the column's top
 * cover (any non-air block, water and leaves included), bottoming out in
 * deep caves. Surfaces under open sky stay fully lit.
 */
export const DEPTH_DARK_MIN = 0.35;
export const DEPTH_DARK_FALLOFF = 0.045;

export function depthBrightness(depthBelowCover: number): number {
  if (depthBelowCover <= 0) return 1;
  return Math.max(DEPTH_DARK_MIN, 1 - depthBelowCover * DEPTH_DARK_FALLOFF);
}

/** Foliage gets a subtle per-column warm/cool tint so plains aren't flat. */
const TINT_SALT = 0x7e11a9;
const TINTED = new Set<number>([Block.grass, Block.leaves]);

export function foliageTint(wx: number, wz: number): { r: number; b: number } {
  // 4-block patches; subtle ±6% red / ±8% blue swing around neutral.
  const h = hash2(TINT_SALT, wx >> 2, wz >> 2);
  return { r: 0.94 + ((h & 0xff) / 255) * 0.12, b: 0.88 + (((h >> 8) & 0xff) / 255) * 0.16 };
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
 * Per-face, per-vertex AO sample offsets (side1/side2/corner), derived from
 * the face tables: one step along the normal, then toward the vertex corner
 * along each in-plane axis.
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
  indices: number[] = [];
  minX = Infinity;
  minY = Infinity;
  minZ = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;
  maxZ = -Infinity;

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
    depthFactor: number,
    tintR: number,
    tintB: number,
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
      const light = shade * (AO_BRIGHTNESS[ao] ?? 1) * depthFactor;
      this.colors.push(light * tintR, light, light * tintB);
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
 * Neighbor sample from padded data. Below the world reads as bedrock (culls
 * invisible undersides at y=0); above it as air.
 */
function sampleAt(padded: Uint8Array, px: number, y: number, pz: number): number {
  if (y < 0) return Block.bedrock;
  if (y >= CHUNK_HEIGHT) return Block.air;
  return padded[paddedIndex(px, y, pz)] ?? 0;
}

/** Solid-opaque occluder test for AO (§4.6). */
function occludes(padded: Uint8Array, px: number, y: number, pz: number): boolean {
  if (y < 0 || y >= CHUNK_HEIGHT) return false;
  return OPAQUE[padded[paddedIndex(px, y, pz)] ?? 0] === 1;
}

/**
 * Mesh one chunk from its padded snapshot. Pure — (cx, cz) only seed the
 * deterministic foliage tint hash.
 */
export function meshChunk(padded: Uint8Array, cx: number, cz: number): ChunkMeshData {
  const opaque = new QuadSink();
  const cutout = new QuadSink();
  const water = new QuadSink();
  // Per padded column: topmost non-air y + 1 ("cover height") for depth light.
  const cover = new Int16Array(PAD * PAD);
  for (let pz = 0; pz < PAD; pz++) {
    for (let px = 0; px < PAD; px++) {
      let top = 0;
      for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
        if ((padded[paddedIndex(px, y, pz)] ?? 0) !== Block.air) {
          top = y + 1;
          break;
        }
      }
      cover[pz * PAD + px] = top;
    }
  }
  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const pz = z + 1;
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const px = x + 1;
        const id = padded[paddedIndex(px, y, pz)] ?? 0;
        const pass = PASS[id] ?? PASS_NONE;
        if (pass === PASS_NONE) continue;
        const sink = pass === PASS_OPAQUE ? opaque : pass === PASS_CUTOUT ? cutout : water;
        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          if (!face) continue;
          const nb = sampleAt(padded, px + face.dx, y + face.dy, pz + face.dz);
          // §4.5 culling: emit iff the neighbor is non-opaque AND NOT
          // (same id and both non-opaque) — water/glass/leaves internal
          // faces cull, water against glass renders.
          if (OPAQUE[nb] === 1) continue;
          if (nb === id && OPAQUE[id] !== 1) continue;
          const aoTable = FACE_AO[f];
          let ao0 = 3;
          let ao1 = 3;
          let ao2 = 3;
          let ao3 = 3;
          if (aoTable) {
            for (let v = 0; v < 4; v++) {
              const o = aoTable[v];
              if (!o) continue;
              const s1 = occludes(padded, px + (o[0] ?? 0), y + (o[1] ?? 0), pz + (o[2] ?? 0));
              const s2 = occludes(padded, px + (o[3] ?? 0), y + (o[4] ?? 0), pz + (o[5] ?? 0));
              const co = occludes(padded, px + (o[6] ?? 0), y + (o[7] ?? 0), pz + (o[8] ?? 0));
              const ao = computeAO(s1, s2, co);
              if (v === 0) ao0 = ao;
              else if (v === 1) ao1 = ao;
              else if (v === 2) ao2 = ao;
              else ao3 = ao;
            }
          }
          // Light the face by its air-side cell's depth below cover.
          const nbPx = Math.min(PAD - 1, Math.max(0, px + face.dx));
          const nbPz = Math.min(PAD - 1, Math.max(0, pz + face.dz));
          const nbY = Math.min(CHUNK_HEIGHT - 1, Math.max(0, y + face.dy));
          const depth = (cover[nbPz * PAD + nbPx] ?? 0) - 1 - nbY;
          const depthFactor = depthBrightness(depth);
          let tintR = 1;
          let tintB = 1;
          if (TINTED.has(id)) {
            const tint = foliageTint(cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z);
            tintR = tint.r;
            tintB = tint.b;
          }
          sink.pushQuad(
            x, y, z, face, FACE_TILES[id * 6 + f] ?? 0, FACE_SHADE[f] ?? 1,
            ao0, ao1, ao2, ao3, depthFactor, tintR, tintB,
          );
        }
      }
    }
  }
  return { opaque: opaque.toArrays(), cutout: cutout.toArrays(), water: water.toArrays() };
}

/**
 * Padded snapshot for a lone chunk: the border ring clamps to the chunk's own
 * edge columns, so world-edge side walls are culled as they would be with
 * real neighbors. Used by tests; streaming builds borders from real
 * neighbor chunks.
 */
export function padLoneChunk(data: Uint8Array): Uint8Array {
  const padded = new Uint8Array(PADDED_VOLUME);
  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let pz = 0; pz < PAD; pz++) {
      const z = Math.min(CHUNK_SIZE - 1, Math.max(0, pz - 1));
      for (let px = 0; px < PAD; px++) {
        const x = Math.min(CHUNK_SIZE - 1, Math.max(0, px - 1));
        padded[paddedIndex(px, y, pz)] = data[blockIndex(x, y, z)] ?? 0;
      }
    }
  }
  return padded;
}
