/**
 * Container store: per-world-position chest inventories. The game layer owns
 * this (it bridges block edits to stored item data) and serializes it into the
 * world save. Keyed by "x,y,z".
 */
import { Block } from './blocks';
import { CHEST_SIZE, Inventory, type SerializedInventory } from '../player/inventory';

export type SerializedContainers = Array<{ pos: [number, number, number]; items: SerializedInventory }>;

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export class ContainerStore {
  private readonly chests = new Map<string, Inventory>();

  /** The chest inventory at a cell, creating an empty one on first access. */
  get(x: number, y: number, z: number): Inventory {
    const k = key(x, y, z);
    let inv = this.chests.get(k);
    if (!inv) {
      inv = new Inventory(CHEST_SIZE);
      this.chests.set(k, inv);
    }
    return inv;
  }

  has(x: number, y: number, z: number): boolean {
    return this.chests.has(key(x, y, z));
  }

  /**
   * React to a block edit: a placed chest gets a fresh inventory; a broken
   * chest hands its contents to `spill` (e.g. the player inventory) and is
   * removed. Returns leftover items that didn't fit on break.
   */
  onBlockChanged(
    kind: 'place' | 'break',
    id: number,
    x: number,
    y: number,
    z: number,
    spill?: (itemId: number, count: number) => number,
  ): void {
    const k = key(x, y, z);
    if (kind === 'place' && id === Block.chest) {
      if (!this.chests.has(k)) this.chests.set(k, new Inventory(CHEST_SIZE));
    } else if (kind === 'break') {
      const inv = this.chests.get(k);
      if (inv) {
        if (spill) {
          for (const slot of inv.slots) {
            if (slot) spill(slot.id, slot.count); // overflow simply lost
          }
        }
        this.chests.delete(k);
      }
    }
  }

  clear(): void {
    this.chests.clear();
  }

  serialize(): SerializedContainers {
    const out: SerializedContainers = [];
    for (const [k, inv] of this.chests) {
      const parts = k.split(',').map(Number);
      if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) continue;
      out.push({ pos: [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0], items: inv.serialize() });
    }
    return out;
  }

  load(data: SerializedContainers | undefined): void {
    this.chests.clear();
    if (!Array.isArray(data)) return;
    for (const entry of data) {
      if (!entry || !Array.isArray(entry.pos) || entry.pos.length !== 3) continue;
      const [x, y, z] = entry.pos;
      const inv = new Inventory(CHEST_SIZE);
      inv.load(entry.items);
      this.chests.set(key(x, y, z), inv);
    }
  }
}
