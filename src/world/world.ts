/**
 * World: the chunk map, cross-chunk block access and streaming (§4.5).
 *
 * Streaming model:
 *  - chunk *data* is kept for Chebyshev radius RD+1 around the player chunk
 *    (meshing needs a 1-chunk data ring), *meshes* for radius RD;
 *  - gen/mesh jobs are queued by distance ascending, at most MAX_JOBS_IN_FLIGHT
 *    worker jobs run concurrently, and at most MAX_UPLOADS_PER_FRAME freshly
 *    meshed chunks become GPU geometry per frame;
 *  - beyond RD+2 chunks unload: geometries are disposed, unmodified data is
 *    discarded (regen is cheap).
 */
import * as THREE from 'three';
import { blockIndex, CHUNK_HEIGHT, CHUNK_SIZE, chunkCoord } from './chunk';
import { PAD, PADDED_VOLUME, paddedIndex, type ChunkMeshData, type MeshArrays } from './mesher';
import type { WorkerPool } from '../workers/pool';

export const MAX_JOBS_IN_FLIGHT = 6;
const MAX_UPLOADS_PER_FRAME = 2;
const UNLOAD_MARGIN = 2; // unload beyond RD + this

interface ChunkRecord {
  readonly cx: number;
  readonly cz: number;
  readonly key: number;
  data: Uint8Array | null;
  genQueued: boolean;
  genPending: boolean;
  meshQueued: boolean;
  meshPending: boolean;
  /** Bumped on every edit; in-flight mesh results with an older seq are dropped. */
  meshSeq: number;
  /** True when current meshes match meshSeq (an all-air result also counts). */
  meshed: boolean;
  meshes: { opaque: THREE.Mesh | null };
  modified: boolean;
  dist: number;
}

function chunkKey(cx: number, cz: number): number {
  return cx * 0x4000000 + cz; // unique while |cx|,|cz| < 2^25
}

export interface WorldStats {
  chunksLoaded: number;
  chunksMeshed: number;
  genQueued: number;
  meshQueued: number;
  jobsInFlight: number;
  uploadsQueued: number;
}

export class World {
  readonly seed: string;
  private readonly scene: THREE.Scene;
  private readonly material: THREE.Material;
  private readonly pool: WorkerPool;
  private readonly chunks = new Map<number, ChunkRecord>();
  private renderDistance: number;
  private centerCx = Number.NaN;
  private centerCz = Number.NaN;
  private scanNeeded = true;
  private genQueue: ChunkRecord[] = [];
  private meshQueue: ChunkRecord[] = [];
  private readonly uploadQueue: Array<{ rec: ChunkRecord; seq: number; mesh: ChunkMeshData }> = [];
  /** Single-entry chunk cache for the hot getBlock path. */
  private cachedKey = Number.NaN;
  private cachedRec: ChunkRecord | null = null;

  constructor(opts: { seed: string; scene: THREE.Scene; material: THREE.Material; pool: WorkerPool; renderDistance: number }) {
    this.seed = opts.seed;
    this.scene = opts.scene;
    this.material = opts.material;
    this.pool = opts.pool;
    this.renderDistance = opts.renderDistance;
  }

  setRenderDistance(rd: number): void {
    if (rd !== this.renderDistance) {
      this.renderDistance = rd;
      this.scanNeeded = true;
    }
  }

  /** Block id at world coords; air outside loaded chunks or y bounds. */
  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return 0;
    const rec = this.recAt(chunkCoord(wx), chunkCoord(wz));
    if (!rec || !rec.data) return 0;
    return rec.data[blockIndex(wx - rec.cx * CHUNK_SIZE, wy, wz - rec.cz * CHUNK_SIZE)] ?? 0;
  }

  /** True when the chunk containing this column has data (physics readiness). */
  hasDataAt(wx: number, wz: number): boolean {
    const rec = this.recAt(chunkCoord(wx), chunkCoord(wz));
    return rec !== null && rec.data !== null;
  }

  private recAt(cx: number, cz: number): ChunkRecord | null {
    const key = chunkKey(cx, cz);
    if (key === this.cachedKey) return this.cachedRec;
    const rec = this.chunks.get(key) ?? null;
    this.cachedKey = key;
    this.cachedRec = rec;
    return rec;
  }

  /** Per-frame streaming pump. */
  update(playerX: number, playerZ: number): void {
    const pcx = chunkCoord(Math.floor(playerX));
    const pcz = chunkCoord(Math.floor(playerZ));
    if (pcx !== this.centerCx || pcz !== this.centerCz) {
      this.centerCx = pcx;
      this.centerCz = pcz;
      this.scanNeeded = true;
    }
    if (this.scanNeeded) {
      this.scanNeeded = false;
      this.rescan();
    }
    this.dispatchJobs();
    this.drainUploads();
  }

  private chebyshev(rec: { cx: number; cz: number }): number {
    return Math.max(Math.abs(rec.cx - this.centerCx), Math.abs(rec.cz - this.centerCz));
  }

  private rescan(): void {
    const rd = this.renderDistance;
    const dataRadius = rd + 1;

    // Unload pass.
    for (const rec of this.chunks.values()) {
      if (this.chebyshev(rec) > rd + UNLOAD_MARGIN) {
        this.disposeMeshes(rec);
        rec.meshed = false;
        rec.meshQueued = false;
        rec.genQueued = false;
        // Keep modified chunks (and any with a job in flight, to keep
        // bookkeeping simple — they're re-checked on completion).
        if (!rec.modified && !rec.genPending && !rec.meshPending) {
          this.chunks.delete(rec.key);
          if (this.cachedKey === rec.key) {
            this.cachedKey = Number.NaN;
            this.cachedRec = null;
          }
        }
      }
    }

    // Want-lists.
    this.genQueue.length = 0;
    this.meshQueue.length = 0;
    for (let dz = -dataRadius; dz <= dataRadius; dz++) {
      for (let dx = -dataRadius; dx <= dataRadius; dx++) {
        const cx = this.centerCx + dx;
        const cz = this.centerCz + dz;
        const key = chunkKey(cx, cz);
        let rec = this.chunks.get(key);
        if (!rec) {
          rec = {
            cx,
            cz,
            key,
            data: null,
            genQueued: false,
            genPending: false,
            meshQueued: false,
            meshPending: false,
            meshSeq: 0,
            meshed: false,
            meshes: { opaque: null },
            modified: false,
            dist: 0,
          };
          this.chunks.set(key, rec);
        }
        rec.dist = Math.max(Math.abs(dx), Math.abs(dz));
        rec.genQueued = false;
        rec.meshQueued = false;
        if (!rec.data && !rec.genPending) {
          rec.genQueued = true;
          this.genQueue.push(rec);
        } else if (
          rec.dist <= rd &&
          rec.data &&
          !rec.meshed &&
          !rec.meshPending &&
          this.neighborsReady(cx, cz)
        ) {
          rec.meshQueued = true;
          this.meshQueue.push(rec);
        }
      }
    }
    // Sort descending so the closest job pops off the end.
    this.genQueue.sort((a, b) => b.dist - a.dist);
    this.meshQueue.sort((a, b) => b.dist - a.dist);
  }

  /** All 8 XZ neighbors have data (diagonals included, for exact corner AO). */
  private neighborsReady(cx: number, cz: number): boolean {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const rec = this.chunks.get(chunkKey(cx + dx, cz + dz));
        if (!rec || !rec.data) return false;
      }
    }
    return true;
  }

  private dispatchJobs(): void {
    while (this.pool.hasIdle && this.pool.inFlight < MAX_JOBS_IN_FLIGHT) {
      const gen = this.genQueue[this.genQueue.length - 1];
      const mesh = this.meshQueue[this.meshQueue.length - 1];
      // Closest job first across both queues; meshes win ties (visible sooner).
      if (mesh && (!gen || mesh.dist <= gen.dist)) {
        this.meshQueue.pop();
        this.submitMesh(mesh);
      } else if (gen) {
        this.genQueue.pop();
        this.submitGen(gen);
      } else {
        break;
      }
    }
  }

  private submitGen(rec: ChunkRecord): void {
    rec.genQueued = false;
    if (rec.data || rec.genPending || this.chebyshev(rec) > this.renderDistance + 1) return;
    rec.genPending = true;
    this.pool.submit({ kind: 'gen', seed: this.seed, cx: rec.cx, cz: rec.cz }, [], (res) => {
      rec.genPending = false;
      if (res.kind !== 'gen') return;
      if (this.chebyshev(rec) > this.renderDistance + UNLOAD_MARGIN) {
        // Player moved on; drop (and forget the record if it's prunable).
        if (!rec.modified) this.chunks.delete(rec.key);
        return;
      }
      rec.data = res.data;
      this.scanNeeded = true; // this chunk (and neighbors) may now be meshable
    });
  }

  private submitMesh(rec: ChunkRecord): void {
    rec.meshQueued = false;
    if (!rec.data || rec.meshPending || rec.meshed || this.chebyshev(rec) > this.renderDistance) return;
    const padded = this.buildPaddedSnapshot(rec.cx, rec.cz);
    if (!padded) return; // neighbor vanished; a later rescan will requeue
    const seq = rec.meshSeq;
    rec.meshPending = true;
    this.pool.submit({ kind: 'mesh', cx: rec.cx, cz: rec.cz, padded }, [padded.buffer as ArrayBuffer], (res) => {
      rec.meshPending = false;
      if (res.kind !== 'mesh') return;
      if (rec.meshSeq !== seq) {
        this.scanNeeded = true; // edited while meshing: requeue
        return;
      }
      if (this.chebyshev(rec) > this.renderDistance + UNLOAD_MARGIN) return;
      this.uploadQueue.push({ rec, seq, mesh: res.mesh });
    });
  }

  /**
   * Snapshot chunk + 1-block neighbor border into a PAD^2 x 128 buffer.
   * Returns null unless the chunk and all 8 neighbors have data.
   */
  buildPaddedSnapshot(cx: number, cz: number): Uint8Array | null {
    const grid: Array<Uint8Array | null> = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const rec = this.chunks.get(chunkKey(cx + dx, cz + dz));
        grid.push(rec?.data ?? null);
      }
    }
    if (grid.some((g) => g === null)) return null;
    const at = (dx: number, dz: number): Uint8Array => grid[(dz + 1) * 3 + (dx + 1)] as Uint8Array;

    const padded = new Uint8Array(PADDED_VOLUME);
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let pz = 0; pz < PAD; pz++) {
        const zoneDz = pz === 0 ? -1 : pz === PAD - 1 ? 1 : 0;
        const z = pz === 0 ? CHUNK_SIZE - 1 : pz === PAD - 1 ? 0 : pz - 1;
        const mid = at(0, zoneDz);
        const row = blockIndex(0, y, z);
        padded.set(mid.subarray(row, row + CHUNK_SIZE), paddedIndex(1, y, pz));
        padded[paddedIndex(0, y, pz)] = at(-1, zoneDz)[blockIndex(CHUNK_SIZE - 1, y, z)] ?? 0;
        padded[paddedIndex(PAD - 1, y, pz)] = at(1, zoneDz)[blockIndex(0, y, z)] ?? 0;
      }
    }
    return padded;
  }

  private drainUploads(): void {
    for (let n = 0; n < MAX_UPLOADS_PER_FRAME; n++) {
      const item = this.uploadQueue.shift();
      if (!item) return;
      const { rec, seq, mesh } = item;
      if (rec.meshSeq !== seq || this.chebyshev(rec) > this.renderDistance + UNLOAD_MARGIN) continue;
      this.installMesh(rec, mesh);
    }
  }

  /** Replace a chunk's scene meshes with freshly built geometry. */
  installMesh(rec: ChunkRecord, mesh: ChunkMeshData): void {
    this.disposeMeshes(rec);
    rec.meshes.opaque = this.createPassMesh(rec, mesh.opaque, this.material, 0);
    rec.meshed = true;
  }

  private createPassMesh(
    rec: ChunkRecord,
    arrays: MeshArrays | null,
    material: THREE.Material,
    renderOrder: number,
  ): THREE.Mesh | null {
    if (!arrays) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(arrays.positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(arrays.uvs, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(arrays.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(arrays.indices, 1));
    const b = arrays.bounds;
    geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2),
      Math.hypot(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ) / 2 + 0.01,
    );
    const obj = new THREE.Mesh(geometry, material);
    obj.position.set(rec.cx * CHUNK_SIZE, 0, rec.cz * CHUNK_SIZE);
    obj.renderOrder = renderOrder;
    obj.matrixAutoUpdate = false;
    obj.updateMatrix();
    this.scene.add(obj);
    return obj;
  }

  private disposeMeshes(rec: ChunkRecord): void {
    const m = rec.meshes.opaque;
    if (m) {
      this.scene.remove(m);
      m.geometry.dispose();
      rec.meshes.opaque = null;
    }
  }

  stats(out: WorldStats): WorldStats {
    let loaded = 0;
    let meshed = 0;
    for (const rec of this.chunks.values()) {
      if (rec.data) loaded++;
      if (rec.meshed) meshed++;
    }
    out.chunksLoaded = loaded;
    out.chunksMeshed = meshed;
    out.genQueued = this.genQueue.length;
    out.meshQueued = this.meshQueue.length;
    out.jobsInFlight = this.pool.inFlight;
    out.uploadsQueued = this.uploadQueue.length;
    return out;
  }
}
