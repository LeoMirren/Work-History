/**
 * Village barter (pure data — no DOM, no THREE): every warden keeps a small
 * book of three offers drawn deterministically from a weighted pool, so the
 * same villager of the same village always quotes the same trades on the same
 * world seed. The economy is deliberately lopsided: everyday produce and fuel
 * swaps are common and cheap, while tools and armor are rare and priced in
 * gems and gold. `applyTrade` is atomic — a trade either completes in full or
 * leaves the inventory untouched (payments are refunded when the reward
 * cannot fit).
 */
import { Block } from './blocks';
import { Item } from './items';
import { hash2 } from './noise';

/** One barter: hand over `give`, receive `get`. Both sides are immutable. */
export interface TradeOffer {
  readonly give: { readonly id: number; readonly count: number };
  readonly get: { readonly id: number; readonly count: number };
}

/** How many offers each warden quotes (unique draws from the pool). */
export const OFFERS_PER_VILLAGER = 3;

/** Build one immutable pool entry: pay giveCount×giveId for getCount×getId. */
function barter(giveId: number, giveCount: number, getId: number, getCount: number): TradeOffer {
  return { give: { id: giveId, count: giveCount }, get: { id: getId, count: getCount } };
}

interface PoolEntry {
  readonly weight: number;
  readonly offer: TradeOffer;
}

/**
 * The whole village economy. Weights skew the draw toward workaday swaps
 * (harvest, kitchen, kiln, fuel); gear sits at the rare end and only ever
 * costs precious goods — gems buy tools, gold buys armor. Food is cheap to
 * buy and modest to sell, so gold→bread→gold round trips always lose.
 */
const POOL: readonly PoolEntry[] = [
  { weight: 4, offer: barter(Item.grain, 10, Item.ingot, 2) }, // the mill pays iron for harvest
  { weight: 4, offer: barter(Item.seeds, 12, Item.bread, 3) }, // seed stock for the ovens
  { weight: 3, offer: barter(Item.meat, 5, Item.charcoal, 3) }, // the smokehouse
  { weight: 3, offer: barter(Item.coal, 14, Block.torch, 6) }, // lamplighter's bundle
  { weight: 3, offer: barter(Block.cobblestone, 8, Block.brick, 4) }, // the kiln
  { weight: 3, offer: barter(Item.goldIngot, 2, Item.bread, 8) }, // food is cheap for gold
  { weight: 2, offer: barter(Item.bread, 6, Item.goldIngot, 1) }, // ...and sells for less
  { weight: 2, offer: barter(Item.gem, 3, Item.gemPickaxe, 1) }, // tools cost gems
  { weight: 2, offer: barter(Item.goldIngot, 3, Item.ironVest, 1) }, // armor costs gold
  { weight: 1, offer: barter(Item.gem, 5, Item.goldVest, 1) }, // the rarest fitting
];

const TOTAL_WEIGHT = POOL.reduce((sum, entry) => sum + entry.weight, 0);

/**
 * The offer book for one warden: OFFERS_PER_VILLAGER weighted draws without
 * replacement from POOL. Pure and stateless — everything derives from
 * hash2 over (seedInt, villageKey, villagerIndex), so a warden's book
 * survives despawns, reloads and respawns unchanged. Never returns
 * duplicates: a drawn entry leaves the pool for the remaining draws.
 */
export function offersFor(
  seedInt: number,
  villageKey: number,
  villagerIndex: number,
): readonly TradeOffer[] {
  const base = hash2(seedInt, villageKey, villagerIndex);
  const taken = new Array<boolean>(POOL.length).fill(false);
  const offers: TradeOffer[] = [];
  let remaining = TOTAL_WEIGHT;
  for (let draw = 0; draw < OFFERS_PER_VILLAGER; draw++) {
    let roll = hash2(base, draw, 0) % remaining;
    for (let i = 0; i < POOL.length; i++) {
      const entry = POOL[i];
      if (!entry || taken[i]) continue;
      if (roll < entry.weight) {
        offers.push(entry.offer);
        taken[i] = true;
        remaining -= entry.weight;
        break;
      }
      roll -= entry.weight;
    }
  }
  return offers;
}

/** Can an inventory (abstracted to a count lookup) pay for the offer? */
export function canAfford(countOf: (id: number) => number, offer: TradeOffer): boolean {
  return countOf(offer.give.id) >= offer.give.count;
}

/**
 * What `applyTrade` needs from an inventory. `add` must return the count
 * that did NOT fit (0 means everything landed) — Inventory.add's contract.
 * `remove`'s return value is never consulted (Inventory returns a boolean, a
 * simpler counter may return the removed count; both satisfy this shape).
 */
export interface TradeInventory {
  countOf(id: number): number;
  remove(id: number, count: number): number | boolean;
  add(id: number, count: number): number;
}

/**
 * Execute an offer atomically. Refuses (returns false, inventory unchanged)
 * when the payment is short, or when the reward doesn't fully fit — in that
 * case whatever part of the reward landed is pulled back and the payment is
 * re-added (its freshly vacated space guarantees the refund fits).
 */
export function applyTrade(inv: TradeInventory, offer: TradeOffer): boolean {
  if (!canAfford((id) => inv.countOf(id), offer)) return false;
  inv.remove(offer.give.id, offer.give.count);
  const leftover = inv.add(offer.get.id, offer.get.count);
  if (leftover > 0) {
    inv.remove(offer.get.id, offer.get.count - leftover);
    inv.add(offer.give.id, offer.give.count);
    return false;
  }
  return true;
}
