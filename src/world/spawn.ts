/**
 * World spawn selection: every seed gets its own landing spot — a dry,
 * walkable column rolled from the seed (deterministic: the same world always
 * spawns at the same place; different worlds land somewhere new, up to
 * ~640 blocks from origin). Works from heightAt noise alone, so no chunks
 * need generating to choose it.
 */
import { createGenerator, SEA_LEVEL, type Generator } from './worldgen';
import { rngFromSeed } from './noise';

const SPAWN_RANGE = 640;
const PROBE_STEP = 12;
const MAX_PROBES = 240;
/** Dry land below the peaks: comfortable to land on and to walk out of. */
const MAX_SPAWN_HEIGHT = 96;

function isGoodSpawn(gen: Generator, x: number, z: number): boolean {
  const h = gen.heightAt(x, z);
  return h >= SEA_LEVEL + 2 && h <= MAX_SPAWN_HEIGHT;
}

export function findWorldSpawn(seed: string): { x: number; y: number; z: number } {
  const gen = createGenerator(seed, 'overworld');
  const rng = rngFromSeed(seed, 'spawn');
  const angle = rng() * Math.PI * 2;
  const dist = rng() * SPAWN_RANGE;
  let x = Math.round(Math.cos(angle) * dist);
  let z = Math.round(Math.sin(angle) * dist);
  // Square spiral outward from the rolled point until land turns up.
  let dx = PROBE_STEP;
  let dz = 0;
  let legLen = 1;
  let legStep = 0;
  let legsDone = 0;
  for (let i = 0; i < MAX_PROBES; i++) {
    if (isGoodSpawn(gen, x, z)) return { x: x + 0.5, y: gen.heightAt(x, z) + 2, z: z + 0.5 };
    x += dx;
    z += dz;
    legStep++;
    if (legStep === legLen) {
      legStep = 0;
      const next = dx;
      dx = -dz;
      dz = next;
      legsDone++;
      if (legsDone % 2 === 0) legLen++;
    }
  }
  return { x: 0.5, y: gen.heightAt(0, 0) + 2, z: 0.5 };
}
