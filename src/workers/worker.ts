/**
 * Generic worker: handles both `gen` (worldgen) and `mesh` jobs so the pool
 * can keep every core busy regardless of the job mix. Buffers are transferred
 * back, never copied.
 */
import { createGenerator, type Generator } from '../world/worldgen';
import { meshChunk } from '../world/mesher';
import { meshTransferables, type WorkerRequest, type WorkerResponse } from './protocol';

interface WorkerScope {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(msg: WorkerResponse, transfer: ArrayBuffer[]): void;
}

const scope = globalThis as unknown as WorkerScope;

let generator: Generator | null = null;

scope.onmessage = (e: MessageEvent<WorkerRequest>): void => {
  const req = e.data;
  if (req.kind === 'gen') {
    if (!generator || generator.seed !== req.seed) generator = createGenerator(req.seed);
    const data = generator.generateChunk(req.cx, req.cz);
    scope.postMessage({ id: req.id, kind: 'gen', cx: req.cx, cz: req.cz, data }, [
      data.buffer as ArrayBuffer,
    ]);
  } else {
    const mesh = meshChunk(req.padded);
    scope.postMessage(
      { id: req.id, kind: 'mesh', cx: req.cx, cz: req.cz, mesh },
      meshTransferables(mesh, []),
    );
  }
};
