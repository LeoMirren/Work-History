/**
 * v0.30 species: skydrifter glides, gravemimic plays statue.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AnimalSystem, Species, WEIRD_SPECIES } from '../src/entities/animals';
import { Block } from '../src/world/blocks';

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

const flat = {
  isSolid: (_x: number, y: number) => y <= 9,
  getBlock: (_x: number, y: number) => (y <= 9 ? Block.grass : Block.air),
};

describe('skydrifter', () => {
  it('falls no faster than a glide on spread wings', () => {
    const sys = new AnimalSystem(new THREE.Scene(), mulberry32(3));
    sys.setWorld(flat);
    sys.setSpawning(false);
    const bird = sys.spawnAt(0.5, 40, 0.5, Species.skydrifter);
    let minVy = 0;
    for (let i = 0; i < 60; i++) {
      sys.fixedUpdate(1 / 60, 0.5, 40, 0.5);
      minVy = Math.min(minVy, bird.body.vy);
    }
    expect(minVy).toBeGreaterThanOrEqual(-2.2); // never a plummet
    // A trundler dropped the same way falls much faster.
    const cow = sys.spawnAt(4.5, 40, 0.5, Species.trundler);
    let cowVy = 0;
    for (let i = 0; i < 30; i++) {
      sys.fixedUpdate(1 / 60, 0.5, 40, 0.5);
      cowVy = Math.min(cowVy, cow.body.vy);
    }
    expect(cowVy).toBeLessThan(-4);
  });
});

describe('gravemimic', () => {
  it('is a weird species that stands stone-still until approached', () => {
    expect(WEIRD_SPECIES).toContain(Species.gravemimic);
    const sys = new AnimalSystem(new THREE.Scene(), mulberry32(9));
    sys.setWorld(flat);
    sys.setSpawning(false);
    const rock = sys.spawnAt(10.5, 10, 0.5, Species.gravemimic);
    // Player far: the boulder never moves.
    const sx = rock.body.x;
    const sz = rock.body.z;
    for (let i = 0; i < 60 * 8; i++) sys.fixedUpdate(1 / 60, 40.5, 10, 0.5);
    expect(Math.hypot(rock.body.x - sx, rock.body.z - sz)).toBeLessThan(0.2);
    // Player walks up: it wakes and moves.
    for (let i = 0; i < 60 * 8; i++) sys.fixedUpdate(1 / 60, rock.body.x + 2, 10, rock.body.z);
    expect(Math.hypot(rock.body.x - sx, rock.body.z - sz)).toBeGreaterThan(0.5);
  });
});
