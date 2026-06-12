/**
 * Survival inventory: 9 hotbar slots + 27 main slots of item stacks. Pure
 * data + operations (no DOM); `version` bumps on every mutation so UI can
 * refresh lazily.
 */
import { stackLimit } from '../world/items';

export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 36;

export interface ItemStack {
  id: number;
  count: number;
}

export type SerializedInventory = Array<[number, number] | null>;

export class Inventory {
  readonly slots: Array<ItemStack | null> = new Array<ItemStack | null>(INVENTORY_SIZE).fill(null);
  /** Bumped on every mutation; consumers cache against it. */
  version = 0;

  /**
   * Add items, filling existing stacks first, then empty slots (hotbar
   * before main). Returns the count that did NOT fit.
   */
  add(id: number, count: number): number {
    const limit = stackLimit(id);
    let remaining = count;
    for (let pass = 0; pass < 2 && remaining > 0; pass++) {
      for (let i = 0; i < INVENTORY_SIZE && remaining > 0; i++) {
        const slot = this.slots[i];
        if (pass === 0) {
          if (slot && slot.id === id && slot.count < limit) {
            const take = Math.min(limit - slot.count, remaining);
            slot.count += take;
            remaining -= take;
          }
        } else if (!slot) {
          const take = Math.min(limit, remaining);
          this.slots[i] = { id, count: take };
          remaining -= take;
        }
      }
    }
    if (remaining !== count) this.version++;
    return remaining;
  }

  /** Total count of an id across all slots. */
  countOf(id: number): number {
    let total = 0;
    for (const slot of this.slots) {
      if (slot && slot.id === id) total += slot.count;
    }
    return total;
  }

  /** Remove up to `count` of id; returns true only if fully removed. */
  remove(id: number, count: number): boolean {
    if (this.countOf(id) < count) return false;
    let remaining = count;
    for (let i = 0; i < INVENTORY_SIZE && remaining > 0; i++) {
      const slot = this.slots[i];
      if (!slot || slot.id !== id) continue;
      const take = Math.min(slot.count, remaining);
      slot.count -= take;
      remaining -= take;
      if (slot.count === 0) this.slots[i] = null;
    }
    this.version++;
    return true;
  }

  /** Consume one item from a specific slot (placement). */
  consumeOne(index: number): boolean {
    const slot = this.slots[index];
    if (!slot) return false;
    slot.count--;
    if (slot.count <= 0) this.slots[index] = null;
    this.version++;
    return true;
  }

  /** Click-move semantics: merge same ids up to the limit, else swap. */
  moveOrSwap(from: number, to: number): void {
    if (from === to) return;
    const a = this.slots[from];
    const b = this.slots[to];
    if (!a) return;
    if (b && b.id === a.id) {
      const limit = stackLimit(a.id);
      const take = Math.min(limit - b.count, a.count);
      b.count += take;
      a.count -= take;
      if (a.count === 0) this.slots[from] = null;
    } else {
      this.slots[from] = b ?? null;
      this.slots[to] = a;
    }
    this.version++;
  }

  /** Shift-click: move a stack between hotbar and main inventory regions. */
  quickMove(index: number): void {
    const stack = this.slots[index];
    if (!stack) return;
    const [start, end] = index < HOTBAR_SIZE ? [HOTBAR_SIZE, INVENTORY_SIZE] : [0, HOTBAR_SIZE];
    const limit = stackLimit(stack.id);
    for (let i = start; i < end && stack.count > 0; i++) {
      const target = this.slots[i];
      if (target && target.id === stack.id && target.count < limit) {
        const take = Math.min(limit - target.count, stack.count);
        target.count += take;
        stack.count -= take;
      }
    }
    for (let i = start; i < end && stack.count > 0; i++) {
      if (!this.slots[i]) {
        this.slots[i] = { id: stack.id, count: stack.count };
        stack.count = 0;
      }
    }
    if (stack.count === 0) this.slots[index] = null;
    this.version++;
  }

  clear(): void {
    this.slots.fill(null);
    this.version++;
  }

  serialize(): SerializedInventory {
    return this.slots.map((s) => (s ? [s.id, s.count] : null));
  }

  load(data: SerializedInventory | undefined): void {
    this.slots.fill(null);
    if (Array.isArray(data)) {
      for (let i = 0; i < Math.min(data.length, INVENTORY_SIZE); i++) {
        const entry = data[i];
        if (Array.isArray(entry) && entry.length === 2) {
          const [id, count] = entry;
          if (Number.isInteger(id) && id > 0 && Number.isInteger(count) && count > 0) {
            this.slots[i] = { id, count: Math.min(count, stackLimit(id)) };
          }
        }
      }
    }
    this.version++;
  }
}
