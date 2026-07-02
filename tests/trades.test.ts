/**
 * Village barter: deterministic per-warden offer books drawn without
 * duplicates from the weighted pool, the economy's pricing invariants, and
 * atomic trade application (including the reward-doesn't-fit refund).
 */
import { describe, expect, it } from 'vitest';
import {
  applyTrade,
  canAfford,
  offersFor,
  OFFERS_PER_VILLAGER,
  type TradeOffer,
} from '../src/world/trades';
import { Item } from '../src/world/items';

/**
 * Map-backed inventory with optional per-id capacity, mirroring the real
 * Inventory contracts applyTrade relies on: `add` returns the count that did
 * NOT fit; `remove` takes out up to `count` and reports how many came out.
 */
class FakeInventory {
  private readonly items = new Map<number, number>();
  private readonly caps = new Map<number, number>();

  constructor(stock: ReadonlyArray<readonly [number, number]> = []) {
    for (const [id, count] of stock) this.items.set(id, count);
  }

  /** Refuse to hold more than `max` of `id` — a "slots are full" stand-in. */
  cap(id: number, max: number): void {
    this.caps.set(id, max);
  }

  countOf(id: number): number {
    return this.items.get(id) ?? 0;
  }

  add(id: number, count: number): number {
    const capacity = this.caps.get(id) ?? Infinity;
    const have = this.countOf(id);
    const take = Math.min(count, Math.max(0, capacity - have));
    this.items.set(id, have + take);
    return count - take;
  }

  remove(id: number, count: number): number {
    const have = this.countOf(id);
    const take = Math.min(have, count);
    this.items.set(id, have - take);
    return take;
  }
}

describe('offersFor', () => {
  it('is deterministic per (seed, villageKey, villagerIndex)', () => {
    for (const [seed, key, idx] of [
      [12345, 0, 0],
      [12345, -65536, 2], // packed negative-region key
      [7, 131075, 4],
    ] as const) {
      const a = offersFor(seed, key, idx);
      const b = offersFor(seed, key, idx);
      expect(b).toEqual(a);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    }
  });

  it('always deals exactly 3 offers with no duplicates and sane counts', () => {
    for (let seed = 1; seed <= 4; seed++) {
      for (let key = -3; key <= 3; key++) {
        for (let idx = 0; idx < 5; idx++) {
          const offers = offersFor(seed * 7919, key * 65537 + 11, idx);
          expect(offers.length).toBe(OFFERS_PER_VILLAGER);
          const pairs = new Set(offers.map((o) => `${o.give.id}>${o.get.id}`));
          expect(pairs.size).toBe(OFFERS_PER_VILLAGER); // unique per warden
          for (const o of offers) {
            expect(o.give.count).toBeGreaterThanOrEqual(1);
            expect(o.get.count).toBeGreaterThanOrEqual(1);
            expect(o.give.count).toBeLessThanOrEqual(64);
            expect(o.get.count).toBeLessThanOrEqual(64);
            expect(o.give.id).not.toBe(o.get.id);
          }
        }
      }
    }
  });

  it('varies between wardens of one village', () => {
    const books = new Set<string>();
    for (let idx = 0; idx < 8; idx++) books.add(JSON.stringify(offersFor(4242, 99, idx)));
    expect(books.size).toBeGreaterThan(1);
  });

  it('prices gear only in gems or gold, never in cheap goods', () => {
    const precious = new Set<number>([Item.gem, Item.goldIngot]);
    const gear = new Set<number>([
      Item.gemPickaxe,
      Item.ironVest,
      Item.goldVest,
      Item.woodPickaxe,
      Item.stonePickaxe,
      Item.copperPickaxe,
      Item.ironPickaxe,
      Item.goldPickaxe,
      Item.gemVest,
    ]);
    for (let idx = 0; idx < 64; idx++) {
      for (const o of offersFor(31337, 7, idx)) {
        if (gear.has(o.get.id)) expect(precious.has(o.give.id)).toBe(true);
      }
    }
  });
});

describe('canAfford / applyTrade', () => {
  const offer: TradeOffer = { give: { id: 7, count: 10 }, get: { id: 9, count: 4 } };

  it('canAfford is an exact threshold on the payment id', () => {
    expect(canAfford(() => 10, offer)).toBe(true);
    expect(canAfford(() => 9, offer)).toBe(false);
    expect(canAfford((id) => (id === 7 ? 25 : 0), offer)).toBe(true);
    expect(canAfford((id) => (id === 7 ? 0 : 99), offer)).toBe(false);
  });

  it('applies a trade: payment out, reward in', () => {
    const inv = new FakeInventory([[7, 15]]);
    expect(applyTrade(inv, offer)).toBe(true);
    expect(inv.countOf(7)).toBe(5);
    expect(inv.countOf(9)).toBe(4);
  });

  it('refuses unaffordable trades without touching the inventory', () => {
    const inv = new FakeInventory([
      [7, 9],
      [9, 1],
    ]);
    expect(applyTrade(inv, offer)).toBe(false);
    expect(inv.countOf(7)).toBe(9);
    expect(inv.countOf(9)).toBe(1);
  });

  it('refunds the payment when the reward cannot fit at all', () => {
    const inv = new FakeInventory([[7, 12]]);
    inv.cap(9, 0); // no room for any reward
    expect(applyTrade(inv, offer)).toBe(false);
    expect(inv.countOf(7)).toBe(12); // payment refunded in full
    expect(inv.countOf(9)).toBe(0);
  });

  it('rolls back a partial reward fit atomically', () => {
    const inv = new FakeInventory([
      [7, 10],
      [9, 1],
    ]);
    inv.cap(9, 3); // room for only 2 of the 4 reward items
    expect(applyTrade(inv, offer)).toBe(false);
    expect(inv.countOf(7)).toBe(10); // payment refunded in full
    expect(inv.countOf(9)).toBe(1); // the partial landing was pulled back
  });

  it('completes every drawn pool offer cleanly on a roomy inventory', () => {
    for (let idx = 0; idx < 16; idx++) {
      for (const o of offersFor(2026, 5, idx)) {
        const inv = new FakeInventory([[o.give.id, o.give.count]]);
        expect(canAfford((id) => inv.countOf(id), o)).toBe(true);
        expect(applyTrade(inv, o)).toBe(true);
        expect(inv.countOf(o.give.id)).toBe(0);
        expect(inv.countOf(o.get.id)).toBe(o.get.count);
      }
    }
  });
});
