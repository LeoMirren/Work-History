/**
 * Message types shared between the main thread and generic workers. All
 * payload buffers are transferred (zero-copy) in both directions.
 */
import type { ChunkMeshData } from '../world/mesher';

export interface GenJob {
  kind: 'gen';
  seed: string;
  cx: number;
  cz: number;
}

export interface MeshJob {
  kind: 'mesh';
  cx: number;
  cz: number;
  padded: Uint8Array;
}

export type WorkerJob = GenJob | MeshJob;
export type WorkerRequest = WorkerJob & { id: number };

export interface GenResponse {
  id: number;
  kind: 'gen';
  cx: number;
  cz: number;
  data: Uint8Array;
}

export interface MeshResponse {
  id: number;
  kind: 'mesh';
  cx: number;
  cz: number;
  mesh: ChunkMeshData;
}

export type WorkerResponse = GenResponse | MeshResponse;

/** Collect the transferable buffers of a mesh result. */
export function meshTransferables(mesh: ChunkMeshData, out: ArrayBuffer[]): ArrayBuffer[] {
  for (const pass of [mesh.opaque, mesh.cutout, mesh.water]) {
    if (!pass) continue;
    out.push(
      pass.positions.buffer as ArrayBuffer,
      pass.uvs.buffer as ArrayBuffer,
      pass.colors.buffer as ArrayBuffer,
      pass.indices.buffer as ArrayBuffer,
    );
  }
  return out;
}
