/**
 * Pure, deterministic world generation (§4.4). A Generator is created once
 * per seed (noise instances are reused across chunks); generateChunk is a pure
 * function of (seed, cx, cz).
 *
 * M1 scope: height formula + bedrock/stone/dirt/grass column fill.
 */
import { type NoiseFunction2D } from 'simplex-noise';
import { seededNoise2D } from './noise';
import { Block } from './blocks';
import { blockIndex, CHUNK_SIZE, createChunkData } from './chunk';

export const SEA_LEVEL = 52;

export interface Generator {
  readonly seed: string;
  heightAt(wx: number, wz: number): number;
  generateChunk(cx: number, cz: number): Uint8Array;
}

export function createGenerator(seed: string): Generator {
  const continental: NoiseFunction2D = seededNoise2D(seed, 'continental');
  const hillMask: NoiseFunction2D = seededNoise2D(seed, 'hillMask');
  const hills: NoiseFunction2D = seededNoise2D(seed, 'hills');
  const detail: NoiseFunction2D = seededNoise2D(seed, 'detail');

  function heightAt(wx: number, wz: number): number {
    const c = continental(wx / 512, wz / 512);
    const base = 50 + 22 * c;
    const mask = Math.max(0, hillMask(wx / 300, wz / 300));
    const h = Math.round(base + hills(wx / 96, wz / 96) * 14 * mask + detail(wx / 24, wz / 24) * 3);
    return Math.min(120, Math.max(8, h));
  }

  function generateChunk(cx: number, cz: number): Uint8Array {
    const data = createChunkData();
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const h = heightAt(cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z);
        data[blockIndex(x, 0, z)] = Block.bedrock;
        for (let y = 1; y < h - 4; y++) data[blockIndex(x, y, z)] = Block.stone;
        for (let y = Math.max(1, h - 4); y < h; y++) data[blockIndex(x, y, z)] = Block.dirt;
        data[blockIndex(x, h, z)] = Block.grass;
      }
    }
    return data;
  }

  return { seed, heightAt, generateChunk };
}
