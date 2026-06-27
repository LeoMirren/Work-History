/**
 * Persistence (§4.11) behind a backend interface: IndexedDB in the browser,
 * in-memory for tests. DB `voxelgame` has two stores: `worlds` (key 'default'
 * → world meta) and `chunks` (key "cx,cz" → RLE-encoded Uint8Array).
 */
export interface WorldMeta {
  version: 1;
  seed: string;
  mode: 'creative' | 'survival';
  player: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    flying: boolean;
    hp: number;
    hunger: number;
    inventory: Array<[number, number] | null>;
    armor?: Array<[number, number] | null>;
  };
  settings: { renderDistance: number; mouseSensitivity: number; fov: number };
  timeOfDay: number;
  dimension?: 'overworld' | 'underworld';
  containers?: Array<{ pos: [number, number, number]; items: Array<[number, number] | null> }>;
}

export interface StorageBackend {
  getMeta(): Promise<WorldMeta | null>;
  putMeta(meta: WorldMeta): Promise<void>;
  getChunk(key: string): Promise<Uint8Array | null>;
  putChunk(key: string, encoded: Uint8Array): Promise<void>;
  listChunkKeys(): Promise<string[]>;
  clearAll(): Promise<void>;
}

export function chunkStoreKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

/** In-memory backend (tests / IndexedDB-less fallback). Copies on the way in
 * and out, mimicking structured-clone semantics. */
export class MemoryStorage implements StorageBackend {
  private meta: WorldMeta | null = null;
  private readonly chunks = new Map<string, Uint8Array>();

  getMeta(): Promise<WorldMeta | null> {
    return Promise.resolve(this.meta ? (JSON.parse(JSON.stringify(this.meta)) as WorldMeta) : null);
  }

  putMeta(meta: WorldMeta): Promise<void> {
    this.meta = JSON.parse(JSON.stringify(meta)) as WorldMeta;
    return Promise.resolve();
  }

  getChunk(key: string): Promise<Uint8Array | null> {
    const data = this.chunks.get(key);
    return Promise.resolve(data ? data.slice() : null);
  }

  putChunk(key: string, encoded: Uint8Array): Promise<void> {
    this.chunks.set(key, encoded.slice());
    return Promise.resolve();
  }

  listChunkKeys(): Promise<string[]> {
    return Promise.resolve([...this.chunks.keys()]);
  }

  clearAll(): Promise<void> {
    this.meta = null;
    this.chunks.clear();
    return Promise.resolve();
  }
}

const DB_NAME = 'voxelgame';
const DB_VERSION = 1;
const WORLDS = 'worlds';
const CHUNKS = 'chunks';
const META_KEY = 'default';

function asPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export class IDBStorage implements StorageBackend {
  private constructor(private readonly db: IDBDatabase) {}

  static open(factory: IDBFactory = indexedDB): Promise<IDBStorage> {
    return new Promise((resolve, reject) => {
      const request = factory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(WORLDS)) db.createObjectStore(WORLDS);
        if (!db.objectStoreNames.contains(CHUNKS)) db.createObjectStore(CHUNKS);
      };
      request.onsuccess = () => resolve(new IDBStorage(request.result));
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    });
  }

  private store(name: string, mode: IDBTransactionMode): IDBObjectStore {
    return this.db.transaction(name, mode).objectStore(name);
  }

  async getMeta(): Promise<WorldMeta | null> {
    const result = await asPromise(this.store(WORLDS, 'readonly').get(META_KEY));
    return (result as WorldMeta | undefined) ?? null;
  }

  async putMeta(meta: WorldMeta): Promise<void> {
    await asPromise(this.store(WORLDS, 'readwrite').put(meta, META_KEY));
  }

  async getChunk(key: string): Promise<Uint8Array | null> {
    const result = await asPromise(this.store(CHUNKS, 'readonly').get(key));
    return (result as Uint8Array | undefined) ?? null;
  }

  async putChunk(key: string, encoded: Uint8Array): Promise<void> {
    await asPromise(this.store(CHUNKS, 'readwrite').put(encoded, key));
  }

  async listChunkKeys(): Promise<string[]> {
    const keys = await asPromise(this.store(CHUNKS, 'readonly').getAllKeys());
    return keys.map((k) => String(k));
  }

  async clearAll(): Promise<void> {
    await Promise.all([
      asPromise(this.store(WORLDS, 'readwrite').clear()),
      asPromise(this.store(CHUNKS, 'readwrite').clear()),
    ]);
  }
}
