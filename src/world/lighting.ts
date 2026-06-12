/**
 * Voxel light engine (pure). Two channels over a 48×128×48 snapshot (the
 * meshed chunk plus its full 3×3 neighborhood, so 15-block light never gets
 * clipped at a chunk border):
 *
 *  - sky light: 15 where open to the sky, flood-filled into overhangs/caves
 *    with -1 per step (water/leaves cost extra). Scaled by day brightness in
 *    the shader, so nights darken the world but not torchlight.
 *  - block light: flood-filled from emitting blocks (lanterns).
 *
 * Both run as BFS over the snapshot in the worker (or on the main thread for
 * edit remeshes).
 */
import { Block, LIGHT_EMIT, OPAQUE } from './blocks';
import { CHUNK_HEIGHT } from './chunk';

export const SNAP = 48; // 3x3 chunks
export const SNAP_VOLUME = SNAP * SNAP * CHUNK_HEIGHT;
export const MAX_LIGHT = 15;

export function snapIndex(x: number, y: number, z: number): number {
  return x + z * SNAP + y * SNAP * SNAP;
}

/** Light spread cost through a cell (Infinity = blocked). */
function stepCost(id: number): number {
  if (OPAQUE[id] === 1) return Infinity;
  if (id === Block.water) return 2;
  if (id === Block.leaves) return 2;
  return 1;
}

export interface LightField {
  sky: Uint8Array;
  block: Uint8Array;
}

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** BFS spread of a seeded light buffer (in place). */
function propagate(snapshot: Uint8Array, light: Uint8Array, queue: number[]): void {
  let head = 0;
  while (head < queue.length) {
    const index = queue[head++] ?? 0;
    const level = light[index] ?? 0;
    if (level <= 1) continue;
    const x = index % SNAP;
    const z = ((index / SNAP) | 0) % SNAP;
    const y = (index / (SNAP * SNAP)) | 0;
    for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (nx < 0 || nx >= SNAP || nz < 0 || nz >= SNAP || ny < 0 || ny >= CHUNK_HEIGHT) continue;
      const ni = snapIndex(nx, ny, nz);
      const cost = stepCost(snapshot[ni] ?? 0);
      if (!Number.isFinite(cost)) continue;
      const next = level - cost;
      if (next > (light[ni] ?? 0)) {
        light[ni] = next;
        queue.push(ni);
      }
    }
  }
}

/** Compute both light channels for a snapshot. Pure and deterministic. */
export function computeLight(snapshot: Uint8Array): LightField {
  const sky = new Uint8Array(SNAP_VOLUME);
  const block = new Uint8Array(SNAP_VOLUME);
  const skyQueue: number[] = [];
  const blockQueue: number[] = [];

  // Seed sky: full light pours straight down until the first light-blocker;
  // translucent cover (water/leaves) attenuates but keeps pouring.
  for (let z = 0; z < SNAP; z++) {
    for (let x = 0; x < SNAP; x++) {
      let level = MAX_LIGHT;
      for (let y = CHUNK_HEIGHT - 1; y >= 0 && level > 0; y--) {
        const i = snapIndex(x, y, z);
        const id = snapshot[i] ?? 0;
        const cost = stepCost(id);
        if (!Number.isFinite(cost)) break;
        if (cost > 1) level = Math.max(0, level - cost);
        if (level > 0) {
          sky[i] = level;
          skyQueue.push(i);
        }
      }
    }
  }

  // Seed block light from emitters.
  for (let i = 0; i < SNAP_VOLUME; i++) {
    const emit = LIGHT_EMIT[snapshot[i] ?? 0] ?? 0;
    if (emit > 0) {
      block[i] = emit;
      blockQueue.push(i);
    }
  }

  propagate(snapshot, sky, skyQueue);
  propagate(snapshot, block, blockQueue);
  return { sky, block };
}
