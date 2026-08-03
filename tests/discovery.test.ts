/**
 * Discovery update: surface cairns over buried halls, the pure
 * nearest-throne locator, always-built citadels, and cave wildlife.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createGenerator, nearestThroneChunk } from '../src/world/worldgen';
import { blockIndex, CHUNK_SIZE } from '../src/world/chunk';
import { Block } from '../src/world/blocks';
import { AnimalSystem, Species } from '../src/entities/animals';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('discovery cairns', () => {
  it('crowns the surface above buried structures with glowing markers', () => {
    // Scan a swath: any chunk hosting a carved structure should show a
    // cobble+cobble+glow stack somewhere on its surface.
    const gen = createGenerator('cairn census', 'overworld');
    let cairns = 0;
    for (let cx = -12; cx <= 12 && cairns === 0; cx++) {
      for (let cz = -12; cz <= 12 && cairns === 0; cz++) {
        const data = gen.generateChunk(cx, cz);
        for (let lz = 0; lz < CHUNK_SIZE && cairns === 0; lz++) {
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let y = 118; y < 186; y++) {
              const crown = data[blockIndex(lx, y + 2, lz)];
              if (
                data[blockIndex(lx, y, lz)] === Block.cobblestone &&
                data[blockIndex(lx, y + 1, lz)] === Block.cobblestone &&
                (crown === Block.crystal || crown === Block.lantern || crown === Block.emberrock)
              ) {
                cairns++;
                break;
              }
            }
            if (cairns > 0) break;
          }
        }
      }
    }
    expect(cairns).toBeGreaterThan(0);
  });
});

describe('throne citadel routing', () => {
  it('nearestThroneChunk finds a deterministic host chunk that really builds', () => {
    const at = nearestThroneChunk('routing seed', 0, 0);
    expect(nearestThroneChunk('routing seed', 0, 0)).toEqual(at);
    const data = createGenerator('routing seed', 'underworld').generateChunk(at.cx, at.cz);
    let throne = 0;
    for (let i = 0; i < data.length; i++) if (data[i] === Block.emberthrone) throne++;
    expect(throne).toBe(1); // thrones ALWAYS build in their chunk now
  });
});

describe('cave wildlife', () => {
  it('spawns thornbacks/glimmerbacks/mossharen on stone floors underground', () => {
    const scene = new THREE.Scene();
    const sys = new AnimalSystem(scene, mulberry32(9));
    // A stone slab world: a cave floor at y=40, far below CAVE_WILDLIFE_Y.
    sys.setWorld({
      isSolid: (_x, y) => y <= 39,
      getBlock: (_x, y) => (y <= 39 ? Block.stone : Block.air),
    });
    for (let i = 0; i < 60 * 20; i++) sys.fixedUpdate(1 / 60, 0.5, 40, 0.5);
    expect(sys.animals.length).toBeGreaterThan(0);
    const caveKinds = new Set<number>([Species.thornback, Species.glimmerback, Species.mosshare]);
    for (const a of sys.animals) expect(caveKinds.has(a.species)).toBe(true);
  });
});
