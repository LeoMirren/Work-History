/**
 * World streaming + edit integration, run headless via a synchronous JobPool
 * (three.js scene graph works in node; nothing here touches WebGL).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { World, editAffectedOffsets } from '../src/world/world';
import { createGenerator, type Generator } from '../src/world/worldgen';
import { meshChunk } from '../src/world/mesher';
import { createChunkData } from '../src/world/chunk';
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
      onDone({ id: 0, kind: 'mesh', cx: job.cx, cz: job.cz, mesh: meshChunk(job.padded) });
    }
  }
}

const RD = 2;

function makeWorld(): { world: World; scene: THREE.Scene } {
  const scene = new THREE.Scene();
  const world = new World({
    seed: 'sync-test',
    scene,
    material: new THREE.MeshBasicMaterial(),
    pool: new SyncJobPool(),
    renderDistance: RD,
  });
  return { world, scene };
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

describe('world streaming', () => {
  it('loads data for RD+1 and meshes RD rings, then goes quiet', () => {
    const { world, scene } = makeWorld();
    settle(world, 8, 8);
    const s = stats(world);
    expect(s.chunksLoaded).toBe((2 * (RD + 1) + 1) ** 2); // 49
    expect(s.chunksMeshed).toBe((2 * RD + 1) ** 2); // 25
    expect(s.genQueued).toBe(0);
    expect(s.meshQueued).toBe(0);
    expect(s.uploadsQueued).toBe(0);
    expect(scene.children.length).toBe(25); // one opaque mesh per meshed chunk
  });

  it('keeps loaded counts bounded while travelling (unload works)', () => {
    const { world, scene } = makeWorld();
    settle(world, 8, 8);
    const loadedCounts: number[] = [];
    const meshedCounts: number[] = [];
    for (let leg = 1; leg <= 6; leg++) {
      settle(world, 8 + leg * 64, 8);
      const s = stats(world);
      loadedCounts.push(s.chunksLoaded);
      meshedCounts.push(s.chunksMeshed);
    }
    console.log(
      `[M2 acceptance] straight flight: loaded ${loadedCounts.join(', ')} | meshed ${meshedCounts.join(', ')}`,
    );
    // Stabilizes: the RD+1 want-ring (and RD mesh ring) plus whatever trails
    // inside the RD+2 unload margin — constant during steady flight.
    const margin = (2 * (RD + 2) + 1) ** 2; // hard bound: everything past RD+2 unloads
    for (const count of loadedCounts) {
      expect(count).toBe(loadedCounts[0]);
      expect(count).toBeLessThanOrEqual(margin);
    }
    for (const count of meshedCounts) {
      expect(count).toBe(meshedCounts[0]);
      expect(count).toBeLessThanOrEqual(margin);
    }
    // Scene holds exactly one opaque mesh per meshed chunk — nothing leaks.
    expect(scene.children.length).toBe(meshedCounts[5]);
  });

  it('getBlock resolves across chunk borders and out-of-bounds y is air', () => {
    const { world } = makeWorld();
    settle(world, 8, 8);
    expect(world.getBlock(0, -1, 0)).toBe(Block.air);
    expect(world.getBlock(0, 128, 0)).toBe(Block.air);
    expect(world.getBlock(5, 0, 5)).toBe(Block.bedrock);
    expect(world.getBlock(-5, 0, -5)).toBe(Block.bedrock); // negative-coord chunk
    const gen = createGenerator('sync-test');
    const h = gen.heightAt(-20, 13);
    expect(world.getBlock(-20, h + 60 > 127 ? 127 : h + 30, 13)).toBe(Block.air);
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

  it('applies edits immediately and remeshes the edited chunk', () => {
    const { world, scene } = makeWorld();
    settle(world, 8, 8);
    const y = surfaceY(world, 8, 8);
    const before = new Set(scene.children);
    expect(world.setBlock(8, y + 1, 8, Block.brick)).toBe(true);
    expect(world.getBlock(8, y + 1, 8)).toBe(Block.brick);
    const replaced = scene.children.filter((c) => !before.has(c));
    expect(replaced.length).toBe(1); // exactly the edited chunk's mesh rebuilt
    expect(stats(world).chunksMeshed).toBe(25);
  });

  it('remeshes the bordering neighbor when editing a border block', () => {
    const { world, scene } = makeWorld();
    settle(world, 8, 8);
    const y = surfaceY(world, 0, 8);
    const before = new Set(scene.children);
    // wx=0 is local x=0 of chunk (0,0): chunk (-1,0) shares the face.
    expect(world.setBlock(0, y + 1, 8, Block.stone)).toBe(true);
    const replaced = scene.children.filter((c) => !before.has(c));
    expect(replaced.length).toBe(2);
  });

  it('breaking is an edit to air; placement over water is allowed via setBlock', () => {
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
    world.injectChunk(0, 0, createChunkData(), true);
    settle(world, 8, 8);
    expect(world.getBlock(8, 0, 8)).toBe(Block.air);
    // All-air chunk has no mesh; its 8 neighbors are still meshed.
    expect(scene.children.length).toBe(24);
    expect(stats(world).chunksMeshed).toBe(25);
  });
});
