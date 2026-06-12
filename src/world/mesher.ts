/**
 * Pure chunk mesher (§4.5). Input is a padded snapshot of one chunk plus a
 * 1-block border from its neighbors, so the function needs no world access and
 * runs identically on the main thread or in a worker.
 *
 * Padded layout: px,pz in [0,17] (local -1..16), y in [0,127];
 * index = px + pz*18 + y*324.
 *
 * M1 scope: opaque pass with face culling; flat vertex colors (shading + AO
 * arrive in M5).
 */
import { Block, FACE_TILES, OPAQUE, PASS, PASS_OPAQUE } from './blocks';
import { CHUNK_HEIGHT, CHUNK_SIZE, blockIndex } from './chunk';
import { ATLAS_TILES } from '../engine/atlas';

export const PAD = CHUNK_SIZE + 2; // 18
export const PADDED_VOLUME = PAD * PAD * CHUNK_HEIGHT;

export function paddedIndex(px: number, y: number, pz: number): number {
  return px + pz * PAD + y * PAD * PAD;
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

  pushQuad(x: number, y: number, z: number, face: FaceDef, tile: number): void {
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
      this.colors.push(1, 1, 1);
      if (vx < this.minX) this.minX = vx;
      if (vy < this.minY) this.minY = vy;
      if (vz < this.minZ) this.minZ = vz;
      if (vx > this.maxX) this.maxX = vx;
      if (vy > this.maxY) this.maxY = vy;
      if (vz > this.maxZ) this.maxZ = vz;
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
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

/** Mesh one chunk from its padded snapshot. Pure. */
export function meshChunk(padded: Uint8Array): ChunkMeshData {
  const opaque = new QuadSink();
  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const pz = z + 1;
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const px = x + 1;
        const id = padded[paddedIndex(px, y, pz)] ?? 0;
        if (PASS[id] !== PASS_OPAQUE) continue;
        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          if (!face) continue;
          const nb = sampleAt(padded, px + face.dx, y + face.dy, pz + face.dz);
          // §4.5 culling rule, restricted to opaque emitters: emit iff the
          // neighbor is non-opaque (same-id non-opaque pairs can't occur here).
          if (OPAQUE[nb]) continue;
          opaque.pushQuad(x, y, z, face, FACE_TILES[id * 6 + f] ?? 0);
        }
      }
    }
  }
  return { opaque: opaque.toArrays() };
}

/**
 * Padded snapshot for a lone chunk: the border ring clamps to the chunk's own
 * edge columns, so world-edge side walls are culled as they would be with
 * real neighbors. Used by M1 and tests; streaming builds borders from real
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
