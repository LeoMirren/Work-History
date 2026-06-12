/**
 * Inventory cursor: the "held stack" interaction shared by the inventory and
 * chest screens. Pure (no DOM) so the fiddly stack math is unit-tested.
 *
 * Left click  — empty hand: pick up the whole stack; holding: drop the whole
 *               stack onto an empty slot, merge onto a matching one (overflow
 *               stays in hand), or swap with a different one.
 * Right click — empty hand: pick up half (rounded up); holding: drop one item
 *               onto an empty or matching slot.
 */
import { stackLimit } from '../world/items';
import type { Inventory, ItemStack } from './inventory';

export class Cursor {
  held: ItemStack | null = null;

  leftClick(inv: Inventory, index: number): void {
    const slot = inv.slots[index];
    if (!this.held) {
      if (slot) {
        this.held = slot;
        inv.slots[index] = null;
        inv.version++;
      }
      return;
    }
    if (!slot) {
      inv.slots[index] = this.held;
      this.held = null;
      inv.version++;
      return;
    }
    if (slot.id === this.held.id) {
      const take = Math.min(stackLimit(slot.id) - slot.count, this.held.count);
      slot.count += take;
      this.held.count -= take;
      if (this.held.count === 0) this.held = null;
      inv.version++;
      return;
    }
    // Different items: swap held with the slot.
    inv.slots[index] = this.held;
    this.held = slot;
    inv.version++;
  }

  rightClick(inv: Inventory, index: number): void {
    const slot = inv.slots[index];
    if (!this.held) {
      if (slot && slot.count > 0) {
        const take = Math.ceil(slot.count / 2);
        this.held = { id: slot.id, count: take };
        slot.count -= take;
        if (slot.count === 0) inv.slots[index] = null;
        inv.version++;
      }
      return;
    }
    if (!slot) {
      inv.slots[index] = { id: this.held.id, count: 1 };
      this.held.count--;
      if (this.held.count === 0) this.held = null;
      inv.version++;
    } else if (slot.id === this.held.id && slot.count < stackLimit(slot.id)) {
      slot.count++;
      this.held.count--;
      if (this.held.count === 0) this.held = null;
      inv.version++;
    }
  }

  /** Spill any held items back into an inventory (screen close). */
  returnTo(inv: Inventory): void {
    if (this.held) {
      inv.add(this.held.id, this.held.count);
      this.held = null;
    }
  }
}
