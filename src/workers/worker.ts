/**
 * Generic worker: handles both `gen` (worldgen) and `mesh` jobs so the pool
 * can keep every core busy regardless of the job mix. Buffers are transferred
 * back, never copied. Mesh jobs carry the world seed + dimension so the
 * worker can derive per-column biomes for foliage tinting.
 */
import { createGenerator, type Dimension, type Generator } from '../world/worldgen';
import { CHUNK_SIZE } from '../world/chunk';
import { meshChunk } from '../world/mesher';
import { meshTransferables, type WorkerRequest, type WorkerResponse } from './protocol';

interface WorkerScope {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(msg: WorkerResponse, transfer: ArrayBuffer[]): void;
}

const scope = globalThis as unknown as WorkerScope;

const generators = new Map<string, Generator>();

/** One cached Generator per (seed, dimension), shared by gen and mesh jobs. */
function generatorFor(seed: string, dimension: Dimension): Generator {
  const key = `${seed}|${dimension}`;
  let generator = generators.get(key);
  if (!generator) {
    generator = createGenerator(seed, dimension);
    generators.set(key, generator);
  }
  return generator;
}

/**
 * 256 per-column biome ids (z*16+x, matching the chunk interior) for the
 * mesher's biome tinting — overworld only; the underworld has no biomes and
 * meshes untinted. Built once per mesh job.
 */
function columnBiomes(seed: string, dimension: Dimension, cx: number, cz: number): Uint8Array | undefined {
  if (dimension !== 'overworld') return undefined;
  const biomeAt = generatorFor(seed, dimension).biomeAt;
  const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      biomes[z * CHUNK_SIZE + x] = biomeAt(cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z);
    }
  }
  return biomes;
}

scope.onmessage = (e: MessageEvent<WorkerRequest>): void => {
  const req = e.data;
  if (req.kind === 'gen') {
    const data = generatorFor(req.seed, req.dimension).generateChunk(req.cx, req.cz);
    scope.postMessage({ id: req.id, kind: 'gen', cx: req.cx, cz: req.cz, data }, [
      data.buffer as ArrayBuffer,
    ]);
  } else {
    const biomes = columnBiomes(req.seed, req.dimension, req.cx, req.cz);
    const mesh = meshChunk(req.padded, req.cx, req.cz, biomes);
    scope.postMessage(
      { id: req.id, kind: 'mesh', cx: req.cx, cz: req.cz, mesh },
      meshTransferables(mesh, []),
    );
  }
};
