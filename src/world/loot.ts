/**
 * Structure-chest loot. Worldgen chests (outpost huts, desert ruins) have no
 * container entry until first opened; that first open seeds a haul rolled
 * deterministically from the world seed and chest position, so a reloaded or
 * regenerated world always yields the same find. Pure.
 */
import { Block } from './blocks';
import { Item } from './items';
import { rngFromSeed } from './noise';

export interface LootStack {
  id: number;
  count: number;
}

/** Weighted pool: everyday supplies with the odd rare sparkle. */
const POOL: ReadonlyArray<{ id: number; min: number; max: number; weight: number }> = [
  { id: Item.coal, min: 2, max: 5, weight: 4 },
  { id: Item.stick, min: 2, max: 6, weight: 3 },
  { id: Block.planks, min: 3, max: 8, weight: 3 },
  { id: Item.seeds, min: 1, max: 3, weight: 3 },
  { id: Item.meat, min: 1, max: 2, weight: 2 },
  { id: Item.ingot, min: 1, max: 3, weight: 2 },
  { id: Item.throwingStone, min: 2, max: 5, weight: 2 },
  { id: Block.torch, min: 2, max: 6, weight: 2 },
  { id: Item.goldIngot, min: 1, max: 2, weight: 1 },
  { id: Item.gem, min: 1, max: 1, weight: 1 },
  { id: Item.silverIngot, min: 1, max: 2, weight: 1 },
  { id: Item.emberShard, min: 1, max: 1, weight: 1 },
];

const TOTAL_WEIGHT = POOL.reduce((sum, entry) => sum + entry.weight, 0);

/** Roll 3-6 stacks for the chest at (x, y, z) in the world with this seed. */
export function rollLoot(seed: string, x: number, y: number, z: number): LootStack[] {
  const rng = rngFromSeed(seed, `loot:${x},${y},${z}`);
  const stacks: LootStack[] = [];
  const n = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    let pick = rng() * TOTAL_WEIGHT;
    for (const entry of POOL) {
      if (pick < entry.weight) {
        stacks.push({ id: entry.id, count: entry.min + Math.floor(rng() * (entry.max - entry.min + 1)) });
        break;
      }
      pick -= entry.weight;
    }
  }
  return stacks;
}
