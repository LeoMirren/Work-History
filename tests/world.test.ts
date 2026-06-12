/**
 * World streaming + edit integration, run headless via a synchronous JobPool
 * (three.js scene graph works in node; nothing here touches WebGL).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { World, editAffectedOffsets, type ChunkMaterials } from '../src/world/world';
import { createGenerator, type Generator } from '../src/world/worldgen';
import { meshChunk } from '../src/world/mesher';
import { createChunkData, CHUNK_SIZE } from '../src/world/chunk';
import { Block } from '../src/world/blocks';
import type { JobPool, ResponseHandler } from '../src/workers/pool';
import type { WorkerJob } from '../src/workers/protocol';

class SyncJobPool implements JobPool {
  readonly inFlight = 0;
  readonly hasIdle = true;
  private readonly generators = new Map<string, Generator>();

  submit(job: WorkerJob, _transfer: ArrayBuffer[], onDone: ResponseHandler): void {
    if (job.kind === 'gen') {
      let gen = this.generators.get(job.seed);
      if (!gen) {
        gen = createGenerator(job.seed);
        this.generators.set(job.seed, gen);
      }
      onDone({ id: 0, kind: 'gen', cx: job.cx, cz: job.cz, data: gen.generateChunk(job.cx, job.cz) });
    } else {
      onDone({ id: 0, kind: 'mesh', cx: job.cx, cz: job.cz, mesh: meshChunk(job.padded, job.cx, job.cz) });
    }
  }
}

const RD = 2;
const MESH_RING = (2 * RD + 1) ** 2; // 25
const DATA_RING = (2 * (RD + 1) + 1) ** 2; // 49

function makeMaterials(): ChunkMaterials {
  return {
    opaque: new THREE.MeshBasicMaterial(),
    cutout: new THREE.MeshBasicMaterial({ alphaTest: 0.5 }),
    water: new THREE.MeshBasicMaterial({ transparent: true }),
  };
}

function makeWorld(): { world: World; scene: THREE.Scene; materials: ChunkMaterials } {
  const scene = new THREE.Scene();
  const materials = makeMaterials();
  const world = new World({
    seed: 'sync-test',
    scene,
    materials,
    pool: new SyncJobPool(),
    renderDistance: RD,
  });
  return { world, scene, materials };
}

function settle(world: World, x: number, z: number, iterations = 150): void {
  for (let i = 0; i < iterations; i++) world.update(x, z);
}

function stats(world: World) {
  return world.stats({
    chunksLoaded: 0,
    chunksMeshed: 0,
    genQueued: 0,
    meshQueued: 0,
    jobsInFlight: 0,
    uploadsQueued: 0,
  });
}

function surfaceY(world: World, x: number, z: number): number {
  for (let y = 127; y >= 0; y--) {
    if (world.getBlock(x, y, z) !== Block.air && world.getBlock(x, y, z) !== Block.water) return y;
  }
  throw new Error('no surface found');
}

/** Chunk coords of every scene mesh added since `before`. */
function replacedChunks(scene: THREE.Scene, before: Set<THREE.Object3D>): Set<string> {
  const out = new Set<string>();
  for (const child of scene.children) {
    if (!before.has(child)) out.add(`${child.position.x / CHUNK_SIZE},${child.position.z / CHUNK_SIZE}`);
  }
  return out;
}

describe('world streaming', () => {
  it('loads data for RD+1 and meshes RD rings, then goes quiet', () => {
    const { world, scene } = makeWorld();
    settle(world, 8, 8);
    const s = stats(world);
    expect(s.chunksLoaded).toBe(DATA_RING);
    expect(s.chunksMeshed).toBe(MESH_RING);
    expect(s.genQueued).toBe(0);
    expect(s.meshQueued).toBe(0);
    expect(s.uploadsQueued).toBe(0);
    // 1-3 pass meshes per meshed chunk.
    expect(scene.children.length).toBeGreaterThanOrEqual(MESH_RING);
    expect(scene.children.length).toBeLessThanOrEqual(3 * MESH_RING);
  });

  it('keeps loaded counts bounded while travelling (unload works)', () => {
    const { world, scene } = makeWorld();
    settle(world, 8, 8);
    const loadedCounts: number[] = [];
    const meshedCounts: number[] = [];
    const sceneCounts: number[] = [];
    for (let leg = 1; leg <= 6; leg++) {
      settle(world, 8 + leg * 64, 8);
      const s = stats(world);
      loadedCounts.push(s.chunksLoaded);
      meshedCounts.push(s.chunksMeshed);
      sceneCounts.push(scene.children.length);
    }
    console.log(
      `[M2 acceptance] straight flight: loaded ${loadedCounts.join(', ')} | meshed ${meshedCounts.join(', ')}`,
    );
    // Stabilizes: the RD+1 want-ring (and RD mesh ring) plus whatever trails
    // inside the RD+2 unload margin — constant during steady flight.
    const bound = (2 * (RD + 2) + 1) ** 2; // everything past RD+2 must unload
    for (const count of loadedCounts) {
      expect(count).toBe(loadedCounts[0]);
      expect(count).toBeLessThanOrEqual(bound);
    }
    for (const count of meshedCounts) {
      expect(count).toBe(meshedCounts[0]);
      expect(count).toBeLessThanOrEqual(bound);
    }
    // Scene mesh count must not grow leg over leg (disposal works)...
    const last = sceneCounts[sceneCounts.length - 1] ?? 0;
    expect(last).toBeLessThanOrEqual(Math.max(...sceneCounts));
    expect(last).toBeLessThanOrEqual(3 * bound);
  });

  it('getBlock resolves across chunk borders and out-of-bounds y is air', () => {
    const { world } = makeWorld();
    settle(world, 8, 8);
    expect(world.getBlock(0, -1, 0)).toBe(Block.air);
    expect(world.getBlock(0, 128, 0)).toBe(Block.air);
    expect(world.getBlock(5, 0, 5)).toBe(Block.bedrock);
    expect(world.getBlock(-5, 0, -5)).toBe(Block.bedrock); // negative-coord chunk
  });

  it('only the three shared materials appear on chunk meshes (M5 acceptance)', () => {
    const { world, scene, materials } = makeWorld();
    settle(world, 8, 8);
    const allowed = new Set<THREE.Material>([materials.opaque, materials.cutout, materials.water]);
    const seen = new Set<THREE.Material>();
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        expect(allowed.has(obj.material)).toBe(true);
        seen.add(obj.material);
      }
    });
    expect(seen.size).toBeGreaterThanOrEqual(1);
    expect(seen.size).toBeLessThanOrEqual(3);
  });
});

describe('world edits', () => {
  it('computes border-affected neighbor offsets', () => {
    expect(editAffectedOffsets(5, 5)).toEqual([[0, 0]]);
    expect(editAffectedOffsets(0, 5)).toEqual(
      expect.arrayContaining([
        [0, 0],
        [-1, 0],
      ]),
    );
    expect(editAffectedOffsets(15, 0)).toEqual(
      expect.arrayContaining([
        [0, 0],
        [1, 0],
        [0, -1],
        [1, -1],
      ]),
    );
    expect(editAffectedOffsets(15, 0)).toHaveLength(4);
  });

  it('applies edits immediately, remeshing exactly the edited chunk', () => {
    const { world, scene } = makeWorld();
    settle(world, 8, 8);
    const y = surfaceY(world, 8, 8);
    const before = new Set<THREE.Object3D>(scene.children);
    expect(world.setBlock(8, y + 1, 8, Block.brick)).toBe(true);
    expect(world.getBlock(8, y + 1, 8)).toBe(Block.brick);
    expect(replacedChunks(scene, before)).toEqual(new Set(['0,0']));
    expect(stats(world).chunksMeshed).toBe(MESH_RING);
  });

  it('remeshes the bordering neighbor when editing a border block', () => {
    const { world, scene } = makeWorld();
    settle(world, 8, 8);
    const y = surfaceY(world, 0, 8);
    const before = new Set<THREE.Object3D>(scene.children);
    // wx=0 is local x=0 of chunk (0,0): chunk (-1,0) shares the face.
    expect(world.setBlock(0, y + 1, 8, Block.stone)).toBe(true);
    expect(replacedChunks(scene, before)).toEqual(new Set(['0,0', '-1,0']));
  });

  it('breaking is an edit to air', () => {
    const { world } = makeWorld();
    settle(world, 8, 8);
    const y = surfaceY(world, 8, 8);
    expect(world.setBlock(8, y, 8, Block.air)).toBe(true);
    expect(world.getBlock(8, y, 8)).toBe(Block.air);
  });

  it('injectChunk overrides data and invalidates dependents (persistence path)', () => {
    const { world, scene } = makeWorld();
    settle(world, 8, 8);
    expect(world.getBlock(8, 0, 8)).toBe(Block.bedrock);
    const childrenBefore = scene.children.length;
    world.injectChunk(0, 0, createChunkData(), true);
    settle(world, 8, 8);
    expect(world.getBlock(8, 0, 8)).toBe(Block.air);
    // The all-air chunk dropped its meshes; neighbors were remeshed 1:1.
    expect(scene.children.length).toBeLessThan(childrenBefore);
    expect(stats(world).chunksMeshed).toBe(MESH_RING);
  });
});
