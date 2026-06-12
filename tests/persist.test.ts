/**
 * Persistence (§4.11): backend behavior for both implementations, then the
 * full integration loop — edit → save → reload world → edits present.
 */
import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import * as THREE from 'three';
import { IDBStorage, MemoryStorage, chunkStoreKey, type StorageBackend, type WorldMeta } from '../src/persist/store';
import { decodeRLE, encodeRLE } from '../src/persist/rle';
import { World, type ChunkMaterials, type ChunkPersistence } from '../src/world/world';
import { createGenerator, type Generator } from '../src/world/worldgen';
import { meshChunk } from '../src/world/mesher';
import { CHUNK_VOLUME } from '../src/world/chunk';
import { Block } from '../src/world/blocks';
import type { JobPool, ResponseHandler } from '../src/workers/pool';
import type { WorkerJob } from '../src/workers/protocol';

const sampleMeta: WorldMeta = {
  version: 1,
  seed: 'persist-test',
  mode: 'survival',
  player: { x: 1.5, y: 70, z: -3.5, yaw: 0.4, pitch: -0.2, flying: true, hp: 13 },
  settings: { renderDistance: 6, mouseSensitivity: 1.4, fov: 90 },
  timeOfDay: 200,
};

function backendSuite(name: string, make: () => StorageBackend): void {
  describe(`${name} backend`, () => {
    it('round-trips world meta', async () => {
      const store = make();
      expect(await store.getMeta()).toBeNull();
      await store.putMeta(sampleMeta);
      expect(await store.getMeta()).toEqual(sampleMeta);
    });

    it('stores chunks by key and lists them', async () => {
      const store = make();
      const a = new Uint8Array([1, 2, 3]);
      await store.putChunk(chunkStoreKey(0, 0), a);
      await store.putChunk(chunkStoreKey(-3, 7), new Uint8Array([9]));
      expect(await store.getChunk('0,0')).toEqual(a);
      expect(await store.getChunk('5,5')).toBeNull();
      expect((await store.listChunkKeys()).sort()).toEqual(['-3,7', '0,0']);
    });

    it('clearAll wipes both stores', async () => {
      const store = make();
      await store.putMeta(sampleMeta);
      await store.putChunk('0,0', new Uint8Array([1]));
      await store.clearAll();
      expect(await store.getMeta()).toBeNull();
      expect(await store.listChunkKeys()).toEqual([]);
    });
  });
}

backendSuite('MemoryStorage', () => new MemoryStorage());

describe('IDBStorage (fake-indexeddb)', () => {
  const open = (): Promise<IDBStorage> => IDBStorage.open(new IDBFactory());

  it('round-trips meta and chunks through real IndexedDB semantics', async () => {
    const store = await open();
    await store.putMeta(sampleMeta);
    expect(await store.getMeta()).toEqual(sampleMeta);
    const chunk = new Uint8Array([7, 7, 7, 1, 2, 3]);
    await store.putChunk('1,-2', chunk);
    expect(await store.getChunk('1,-2')).toEqual(chunk);
    expect(await store.listChunkKeys()).toEqual(['1,-2']);
    await store.clearAll();
    expect(await store.getMeta()).toBeNull();
    expect(await store.listChunkKeys()).toEqual([]);
  });
});

// --- Integration: edit -> save -> reload -> edits present -------------------

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

function makeMaterials(): ChunkMaterials {
  return {
    opaque: new THREE.MeshBasicMaterial(),
    cutout: new THREE.MeshBasicMaterial(),
    water: new THREE.MeshBasicMaterial(),
  };
}

const SEED = 'persist-world';

function makeWorld(persistedKeys: Set<string>, storage: StorageBackend): World {
  const persistence: ChunkPersistence = {
    has: (cx, cz) => persistedKeys.has(chunkStoreKey(cx, cz)),
    load: async (cx, cz) => {
      const encoded = await storage.getChunk(chunkStoreKey(cx, cz));
      return encoded ? decodeRLE(encoded, CHUNK_VOLUME) : null;
    },
  };
  return new World({
    seed: SEED,
    scene: new THREE.Scene(),
    materials: makeMaterials(),
    pool: new SyncJobPool(),
    renderDistance: 2,
    persistence,
  });
}

/** Async settle: persistence loads resolve in microtasks between updates. */
async function settle(world: World, x: number, z: number, iterations = 200): Promise<void> {
  for (let i = 0; i < iterations; i++) {
    world.update(x, z);
    await Promise.resolve();
  }
}

describe('persistence integration (in-memory store)', () => {
  it('edit → save → reload world → edits present', async () => {
    const storage = new MemoryStorage();
    const persistedKeys = new Set<string>();

    // Session 1: play and edit (one interior edit, one border edit).
    const world1 = makeWorld(persistedKeys, storage);
    await settle(world1, 8, 8);
    const ySurface = ((): number => {
      for (let y = 127; y >= 0; y--) {
        const id = world1.getBlock(8, y, 8);
        if (id !== Block.air && id !== Block.water) return y;
      }
      throw new Error('no surface');
    })();
    expect(world1.setBlock(8, ySurface + 1, 8, Block.brick)).toBe(true);
    expect(world1.setBlock(8, ySurface, 8, Block.air)).toBe(true); // dig a hole
    expect(world1.setBlock(0, 1, 8, Block.glass)).toBe(true); // border block of chunk (0,0)

    // Save: encode dirty chunks, like main.ts does.
    const puts: Array<Promise<void>> = [];
    const flushed = world1.flushDirty((cx, cz, data) => {
      const key = chunkStoreKey(cx, cz);
      persistedKeys.add(key);
      puts.push(storage.putChunk(key, encodeRLE(data)));
    });
    await Promise.all(puts);
    expect(flushed).toBe(1); // all three edits hit chunk (0,0)
    expect(world1.flushDirty(() => undefined)).toBe(0); // dirty set drained

    // Session 2: fresh world, same seed, persisted chunks override generation.
    const world2 = makeWorld(new Set(persistedKeys), storage);
    await settle(world2, 8, 8);
    expect(world2.getBlock(8, ySurface + 1, 8)).toBe(Block.brick);
    expect(world2.getBlock(8, ySurface, 8)).toBe(Block.air);
    expect(world2.getBlock(0, 1, 8)).toBe(Block.glass);
    // Unedited chunks still come from generation.
    expect(world2.getBlock(40, 0, 40)).toBe(Block.bedrock);
    const gen = createGenerator(SEED);
    const h = gen.heightAt(40, 40);
    expect(world2.getBlock(40, h, 40)).not.toBe(Block.air);
  });

  it('autosave-style flush only writes dirty chunks', async () => {
    const storage = new MemoryStorage();
    const persistedKeys = new Set<string>();
    const world = makeWorld(persistedKeys, storage);
    await settle(world, 8, 8);
    expect(world.flushDirty(() => undefined)).toBe(0); // nothing dirty yet
    world.setBlock(8, 100, 8, Block.planks);
    world.setBlock(24, 100, 8, Block.planks); // second chunk
    const keys: string[] = [];
    world.flushDirty((cx, cz) => keys.push(chunkStoreKey(cx, cz)));
    expect(keys.sort()).toEqual(['0,0', '1,0']);
  });
});
