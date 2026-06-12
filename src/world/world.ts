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
import { SOLID } from './blocks';
import { blockIndex, CHUNK_HEIGHT, CHUNK_SIZE, chunkCoord, localCoord } from './chunk';
import { meshChunk, type ChunkMeshData, type MeshArrays } from './mesher';
import { SNAP_VOLUME, snapIndex } from './lighting';
import type { JobPool } from '../workers/pool';

export const MAX_JOBS_IN_FLIGHT = 6;
const MAX_UPLOADS_PER_FRAME = 2;
const MAX_PERSIST_LOADS = 8; // concurrent IndexedDB chunk loads
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
  meshes: { opaque: THREE.Mesh | null; cutout: THREE.Mesh | null; water: THREE.Mesh | null };
  modified: boolean;
  dist: number;
}

export interface ChunkMaterials {
  opaque: THREE.Material;
  cutout: THREE.Material;
  water: THREE.Material;
}

/**
 * Persisted-chunk source: chunks with has()===true load from storage instead
 * of generating. load() resolving null means the entry vanished/corrupted;
 * the caller's has() must then return false so generation takes over.
 */
export interface ChunkPersistence {
  has(cx: number, cz: number): boolean;
  load(cx: number, cz: number): Promise<Uint8Array | null>;
}

function chunkKey(cx: number, cz: number): number {
  return cx * 0x4000000 + cz; // unique while |cx|,|cz| < 2^25
}

/**
 * Chunk offsets whose padded snapshot contains a cell at local (lx, lz):
 * always the chunk itself, plus cardinal/diagonal neighbors when the cell
 * sits on a border (meshing — culling and AO — reads 1 block across).
 */
export function editAffectedOffsets(lx: number, lz: number): Array<readonly [number, number]> {
  const xs: number[] = [0];
  const zs: number[] = [0];
  if (lx === 0) xs.push(-1);
  if (lx === CHUNK_SIZE - 1) xs.push(1);
  if (lz === 0) zs.push(-1);
  if (lz === CHUNK_SIZE - 1) zs.push(1);
  const out: Array<readonly [number, number]> = [];
  for (const dx of xs) {
    for (const dz of zs) out.push([dx, dz] as const);
  }
  return out;
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
  private readonly materials: ChunkMaterials;
  private readonly pool: JobPool;
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
  private readonly persistence: ChunkPersistence | null;
  private pendingLoads = 0;
  /** Chunks edited since the last save flush. */
  private readonly dirtySet = new Set<ChunkRecord>();

  constructor(opts: {
    seed: string;
    scene: THREE.Scene;
    materials: ChunkMaterials;
    pool: JobPool;
    renderDistance: number;
    persistence?: ChunkPersistence;
  }) {
    this.seed = opts.seed;
    this.scene = opts.scene;
    this.materials = opts.materials;
    this.pool = opts.pool;
    this.renderDistance = opts.renderDistance;
    this.persistence = opts.persistence ?? null;
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

  /** getBlock as a bound function, for raycast/controller consumers. */
  readonly blockAt = (wx: number, wy: number, wz: number): number => this.getBlock(wx, wy, wz);

  /**
   * Edit one block (§4.5 edits): writes data, marks the chunk modified, and
   * synchronously remeshes the edited chunk plus every neighbor whose padded
   * snapshot contains the edited cell — visible the same frame, well inside
   * the ~50ms budget.
   */
  setBlock(wx: number, wy: number, wz: number, id: number): boolean {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return false;
    const cx = chunkCoord(wx);
    const cz = chunkCoord(wz);
    const rec = this.recAt(cx, cz);
    if (!rec || !rec.data) return false;
    const lx = localCoord(wx);
    const lz = localCoord(wz);
    rec.data[blockIndex(lx, wy, lz)] = id;
    rec.modified = true;
    this.dirtySet.add(rec);
    for (const [dx, dz] of editAffectedOffsets(lx, lz)) {
      const neighbor = dx === 0 && dz === 0 ? rec : this.chunks.get(chunkKey(cx + dx, cz + dz));
      if (!neighbor) continue;
      neighbor.meshSeq++;
      if (neighbor.meshed) {
        this.remeshNow(neighbor);
      } else {
        this.scanNeeded = true;
      }
    }
    return true;
  }

  /** Synchronous remesh, bypassing workers and the upload throttle. */
  private remeshNow(rec: ChunkRecord): void {
    const padded = this.buildPaddedSnapshot(rec.cx, rec.cz);
    if (!padded) {
      rec.meshed = false;
      this.scanNeeded = true;
      return;
    }
    this.installMesh(rec, meshChunk(padded, rec.cx, rec.cz));
  }

  /**
   * Install chunk data directly (persisted chunks override generation; also
   * the test seam). Marks data modified so it is never discarded on unload.
   */
  injectChunk(cx: number, cz: number, data: Uint8Array, modified: boolean): void {
    const key = chunkKey(cx, cz);
    let rec = this.chunks.get(key);
    if (!rec) {
      rec = {
        cx,
        cz,
        key,
        data,
        genQueued: false,
        genPending: false,
        meshQueued: false,
        meshPending: false,
        meshSeq: 0,
        meshed: false,
        meshes: { opaque: null, cutout: null, water: null },
        modified,
        dist: this.chebyshev({ cx, cz }),
        };
      this.chunks.set(key, rec);
    } else {
      rec.data = data;
      rec.modified = rec.modified || modified;
      rec.meshSeq++;
      rec.meshed = false;
    }
    // Any already-meshed neighbor meshed against the old border data.
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const nb = this.chunks.get(chunkKey(cx + dx, cz + dz));
        if (nb?.meshed) {
          nb.meshSeq++;
          nb.meshed = false;
        }
      }
    }
    if (this.cachedKey === key) this.cachedRec = rec;
    this.scanNeeded = true;
  }

  /** True when the chunk containing this column has data (physics readiness). */
  hasDataAt(wx: number, wz: number): boolean {
    const rec = this.recAt(chunkCoord(wx), chunkCoord(wz));
    return rec !== null && rec.data !== null;
  }

  /**
   * Collision test for physics (bound so it can be passed as a SolidFn).
   * Outside y-bounds is air; unloaded chunks are impassable so the player
   * can never fall into not-yet-generated terrain.
   */
  readonly isSolid = (wx: number, wy: number, wz: number): boolean => {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return false;
    const rec = this.recAt(chunkCoord(wx), chunkCoord(wz));
    if (!rec || !rec.data) return true;
    const id = rec.data[blockIndex(wx - rec.cx * CHUNK_SIZE, wy, wz - rec.cz * CHUNK_SIZE)] ?? 0;
    return SOLID[id] === 1;
  };

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
            meshes: { opaque: null, cutout: null, water: null },
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
    // Persisted chunks override generation (§4.11).
    if (this.persistence?.has(rec.cx, rec.cz)) {
      if (this.pendingLoads >= MAX_PERSIST_LOADS) {
        rec.genQueued = true;
        this.genQueue.push(rec); // retry next dispatch
        return;
      }
      rec.genPending = true;
      this.pendingLoads++;
      void this.persistence.load(rec.cx, rec.cz).then((data) => {
        this.pendingLoads--;
        rec.genPending = false;
        if (data) this.injectChunk(rec.cx, rec.cz, data, true);
        else this.scanNeeded = true; // fall back to generation on next scan
      });
      return;
    }
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
   * Snapshot the full 3×3 chunk neighborhood into a 48×128×48 buffer (the
   * mesher needs the whole ring so light propagation never clips at a chunk
   * border). Returns null unless the chunk and all 8 neighbors have data.
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

    const snapshot = new Uint8Array(SNAP_VOLUME);
    for (let gz = 0; gz < 3; gz++) {
      for (let gx = 0; gx < 3; gx++) {
        const data = grid[gz * 3 + gx] as Uint8Array;
        const ox = gx * CHUNK_SIZE;
        const oz = gz * CHUNK_SIZE;
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            const row = blockIndex(0, y, z);
            snapshot.set(data.subarray(row, row + CHUNK_SIZE), snapIndex(ox, y, oz + z));
          }
        }
      }
    }
    return snapshot;
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
    rec.meshes.opaque = this.createPassMesh(rec, mesh.opaque, this.materials.opaque, 0);
    rec.meshes.cutout = this.createPassMesh(rec, mesh.cutout, this.materials.cutout, 0);
    // Water draws after everything opaque so depth-testing kills hidden faces.
    rec.meshes.water = this.createPassMesh(rec, mesh.water, this.materials.water, 1);
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
    geometry.setAttribute('light', new THREE.BufferAttribute(arrays.lights, 2));
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
    for (const pass of ['opaque', 'cutout', 'water'] as const) {
      const m = rec.meshes[pass];
      if (m) {
        this.scene.remove(m);
        m.geometry.dispose();
        rec.meshes[pass] = null;
      }
    }
  }

  /**
   * Hand every dirty chunk's data to the saver and clear the dirty set.
   * Returns the number of chunks flushed.
   */
  flushDirty(saver: (cx: number, cz: number, data: Uint8Array) => void): number {
    let flushed = 0;
    for (const rec of this.dirtySet) {
      if (rec.data) {
        saver(rec.cx, rec.cz, rec.data);
        flushed++;
      }
    }
    this.dirtySet.clear();
    return flushed;
  }

  /** Tear down all scene meshes and chunk data (world switch). */
  dispose(): void {
    for (const rec of this.chunks.values()) this.disposeMeshes(rec);
    this.chunks.clear();
    this.genQueue.length = 0;
    this.meshQueue.length = 0;
    this.uploadQueue.length = 0;
    this.dirtySet.clear();
    this.cachedKey = Number.NaN;
    this.cachedRec = null;
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
