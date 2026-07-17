/**
 * Chunk storage layout and index math (§4.1). A chunk is 16x192x16 block ids
 * in one Uint8Array; the index formula is the single source of truth used by
 * worldgen, meshing and the world map alike. (The Great Deepening raised the
 * world from 128 to 192: surface terrain shifted up +64, and the space below
 * became the abyss.)
 */
export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 192;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT; // 49152

/** Local coords x,z in [0,15], y in [0,191] -> flat index. */
export function blockIndex(x: number, y: number, z: number): number {
  return x + (z << 4) + (y << 8);
}

/** Inverse of blockIndex. */
export function indexToLocal(i: number): { x: number; y: number; z: number } {
  return { x: i & 15, z: (i >> 4) & 15, y: i >> 8 };
}

/** World block coord -> chunk coord. */
export function chunkCoord(w: number): number {
  return Math.floor(w / CHUNK_SIZE);
}

/** World block coord -> local coord within its chunk (correct for negatives). */
export function localCoord(w: number): number {
  return w - chunkCoord(w) * CHUNK_SIZE;
}

export function createChunkData(): Uint8Array {
  return new Uint8Array(CHUNK_VOLUME);
}
