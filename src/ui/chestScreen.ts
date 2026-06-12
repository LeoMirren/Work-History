/**
 * Chest screen: the chest's 27 slots above the player's 36, with a classic
 * "held cursor" — click to pick up a whole stack, click again to drop/merge/
 * swap (in either grid), shift-click to quick-transfer to the other grid.
 */
import { ATLAS_TILES, TILE_PX } from '../engine/atlas';
import { type Inventory, type ItemStack, transferStack } from '../player/inventory';
import { stackLimit, iconTileFor, itemName, isBlockId } from '../world/items';
import { blockName } from '../world/blocks';

const ICON_PX = 34;

function nameFor(id: number): string {
  return isBlockId(id) ? blockName(id) : itemName(id);
}

export class ChestScreen {
  visible = false;
  private readonly root: HTMLDivElement;
  private readonly chestGrid: HTMLDivElement;
  private readonly playerGrid: HTMLDivElement;
  private readonly heldLabel: HTMLDivElement;
  private chest: Inventory | null = null;
  private player: Inventory | null = null;
  private atlasCanvas: HTMLCanvasElement | null = null;
  private held: ItemStack | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'chest-screen';
    this.root.className = 'menu-screen hidden';
    const panel = document.createElement('div');
    panel.className = 'menu-panel inventory-panel';
    const heading = document.createElement('h1');
    heading.textContent = 'Chest';

    this.chestGrid = document.createElement('div');
    this.chestGrid.className = 'chest-grid';
    const playerLabel = document.createElement('h2');
    playerLabel.textContent = 'Inventory';
    this.playerGrid = document.createElement('div');
    this.playerGrid.className = 'chest-grid';

    this.heldLabel = document.createElement('div');
    this.heldLabel.className = 'held-label';

    const hint = document.createElement('p');
    hint.className = 'controls-hint';
    hint.textContent = 'click: pick up / drop · shift-click: move across · E/Esc: close';
    panel.append(heading, this.chestGrid, playerLabel, this.playerGrid, this.heldLabel, hint);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
  }

  open(chest: Inventory, player: Inventory, atlasCanvas: HTMLCanvasElement): void {
    this.chest = chest;
    this.player = player;
    this.atlasCanvas = atlasCanvas;
    this.held = null;
    this.visible = true;
    this.buildGrid(this.chestGrid, chest.size, true);
    this.buildGrid(this.playerGrid, player.size, false);
    this.root.classList.remove('hidden');
    this.render();
  }

  close(): void {
    // Return any held stack to the player so items are never lost on close.
    if (this.held && this.player) {
      this.player.add(this.held.id, this.held.count);
      this.held = null;
    }
    this.visible = false;
    this.chest = null;
    this.player = null;
    this.root.classList.add('hidden');
  }

  private buildGrid(grid: HTMLDivElement, size: number, isChest: boolean): void {
    grid.textContent = '';
    for (let i = 0; i < size; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      const icon = document.createElement('canvas');
      icon.width = ICON_PX;
      icon.height = ICON_PX;
      const count = document.createElement('span');
      count.className = 'inv-count';
      slot.append(icon, count);
      slot.addEventListener('click', (e) => this.onClick(isChest, i, e.shiftKey));
      grid.appendChild(slot);
    }
  }

  private onClick(isChest: boolean, index: number, shift: boolean): void {
    const inv = isChest ? this.chest : this.player;
    const other = isChest ? this.player : this.chest;
    if (!inv || !other) return;

    if (shift) {
      transferStack(inv, index, other);
      this.render();
      return;
    }

    const slot = inv.slots[index];
    if (!this.held) {
      if (slot) {
        this.held = slot;
        inv.slots[index] = null;
        inv.version++;
      }
    } else if (!slot) {
      inv.slots[index] = this.held;
      this.held = null;
      inv.version++;
    } else if (slot.id === this.held.id) {
      const limit = stackLimit(slot.id);
      const take = Math.min(limit - slot.count, this.held.count);
      slot.count += take;
      this.held.count -= take;
      if (this.held.count === 0) this.held = null;
      inv.version++;
    } else {
      inv.slots[index] = this.held;
      this.held = slot;
      inv.version++;
    }
    this.render();
  }

  private drawIcon(canvas: HTMLCanvasElement, id: number): void {
    const ctx = canvas.getContext('2d');
    if (!ctx || !this.atlasCanvas) return;
    ctx.clearRect(0, 0, ICON_PX, ICON_PX);
    if (id <= 0) return;
    ctx.imageSmoothingEnabled = false;
    const tile = iconTileFor(id);
    const sx = (tile % ATLAS_TILES) * TILE_PX;
    const sy = Math.floor(tile / ATLAS_TILES) * TILE_PX;
    ctx.drawImage(this.atlasCanvas, sx, sy, TILE_PX, TILE_PX, 0, 0, ICON_PX, ICON_PX);
  }

  private paint(grid: HTMLDivElement, inv: Inventory): void {
    for (let i = 0; i < inv.size; i++) {
      const el = grid.children[i] as HTMLDivElement | undefined;
      if (!el) continue;
      const stack = inv.slots[i];
      const icon = el.querySelector('canvas');
      const count = el.querySelector('.inv-count');
      if (icon) this.drawIcon(icon, stack?.id ?? 0);
      if (count) count.textContent = stack && stack.count > 1 ? String(stack.count) : '';
      el.title = stack ? `${nameFor(stack.id)} ×${stack.count}` : '';
    }
  }

  render(): void {
    if (!this.visible || !this.chest || !this.player) return;
    this.paint(this.chestGrid, this.chest);
    this.paint(this.playerGrid, this.player);
    this.heldLabel.textContent = this.held
      ? `Holding: ${nameFor(this.held.id)} ×${this.held.count}`
      : '';
  }
}
