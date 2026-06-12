/**
 * Survival inventory screen (E): 27 main slots + the 9 hotbar slots, click
 * to move/merge/swap stacks (shift-click quick-moves between regions), and a
 * recipe book that crafts straight from available materials.
 */
import { ATLAS_TILES, TILE_PX } from '../engine/atlas';
import { craft, craftableCount, RECIPES } from '../world/crafting';
import { iconTileFor, itemName, isBlockId } from '../world/items';
import { blockName } from '../world/blocks';
import { HOTBAR_SIZE, INVENTORY_SIZE, type Inventory } from '../player/inventory';

const ICON_PX = 36;

function nameFor(id: number): string {
  return isBlockId(id) ? blockName(id) : itemName(id);
}

export class InventoryScreen {
  visible = false;
  private readonly root: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly recipeList: HTMLDivElement;
  private readonly slotEls: HTMLDivElement[] = [];
  private inventory: Inventory | null = null;
  private atlasCanvas: HTMLCanvasElement | null = null;
  private selectedSlot = -1;
  private renderedVersion = -1;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'inventory-screen';
    this.root.className = 'menu-screen hidden';
    const panel = document.createElement('div');
    panel.className = 'menu-panel inventory-panel';
    const heading = document.createElement('h1');
    heading.textContent = 'Inventory';

    const columns = document.createElement('div');
    columns.className = 'inventory-columns';

    this.grid = document.createElement('div');
    this.grid.id = 'inventory-grid';
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      // Render main rows first, hotbar as the visually separated last row.
      const index = i < INVENTORY_SIZE - HOTBAR_SIZE ? i + HOTBAR_SIZE : i - (INVENTORY_SIZE - HOTBAR_SIZE);
      const slot = document.createElement('div');
      slot.className = 'inv-slot' + (index < HOTBAR_SIZE ? ' hotbar-region' : '');
      const icon = document.createElement('canvas');
      icon.width = ICON_PX;
      icon.height = ICON_PX;
      const count = document.createElement('span');
      count.className = 'inv-count';
      slot.append(icon, count);
      slot.addEventListener('click', (e) => this.onSlotClick(index, e.shiftKey));
      this.grid.appendChild(slot);
      this.slotEls[index] = slot;
    }

    this.recipeList = document.createElement('div');
    this.recipeList.id = 'recipe-list';

    columns.append(this.grid, this.recipeList);
    const hint = document.createElement('p');
    hint.className = 'controls-hint';
    hint.textContent = 'click: pick/move stack · shift-click: quick-move · E/Esc: close';
    panel.append(heading, columns, hint);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
  }

  open(inventory: Inventory, atlasCanvas: HTMLCanvasElement): void {
    this.inventory = inventory;
    this.atlasCanvas = atlasCanvas;
    this.selectedSlot = -1;
    this.renderedVersion = -1;
    this.visible = true;
    this.root.classList.remove('hidden');
    this.render();
  }

  close(): void {
    this.visible = false;
    this.inventory = null;
    this.root.classList.add('hidden');
  }

  private onSlotClick(index: number, shift: boolean): void {
    const inv = this.inventory;
    if (!inv) return;
    if (shift) {
      inv.quickMove(index);
      this.selectedSlot = -1;
    } else if (this.selectedSlot === -1) {
      if (inv.slots[index]) this.selectedSlot = index;
    } else {
      inv.moveOrSwap(this.selectedSlot, index);
      this.selectedSlot = -1;
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

  /** Repaint slots + recipes; cheap enough to run on every mutation. */
  render(): void {
    const inv = this.inventory;
    if (!inv || !this.visible) return;
    this.renderedVersion = inv.version;
    for (let index = 0; index < INVENTORY_SIZE; index++) {
      const el = this.slotEls[index];
      if (!el) continue;
      const stack = inv.slots[index];
      const icon = el.querySelector('canvas');
      const count = el.querySelector('.inv-count');
      if (icon) this.drawIcon(icon, stack?.id ?? 0);
      if (count) count.textContent = stack && stack.count > 1 ? String(stack.count) : '';
      el.title = stack ? `${nameFor(stack.id)} ×${stack.count}` : '';
      el.classList.toggle('selected', index === this.selectedSlot);
    }

    this.recipeList.textContent = '';
    for (const recipe of RECIPES) {
      const row = document.createElement('div');
      row.className = 'recipe-row';
      const icon = document.createElement('canvas');
      icon.width = ICON_PX;
      icon.height = ICON_PX;
      this.drawIcon(icon, recipe.output);
      const label = document.createElement('span');
      label.className = 'recipe-label';
      const ingredients = recipe.inputs.map((i) => `${i.count} ${nameFor(i.id)}`).join(' + ');
      label.textContent = `${recipe.name} ×${recipe.outputCount}`;
      label.title = ingredients;
      const button = document.createElement('button');
      const times = craftableCount(inv, recipe);
      button.textContent = times > 0 ? `Craft (${times})` : 'Craft';
      button.disabled = times === 0;
      button.addEventListener('click', () => {
        if (craft(inv, recipe)) this.render();
      });
      row.append(icon, label, button);
      this.recipeList.appendChild(row);
    }
  }

  /** Re-render if the inventory changed under us (e.g. autosave-time picks). */
  refreshIfStale(): void {
    if (this.visible && this.inventory && this.inventory.version !== this.renderedVersion) {
      this.render();
    }
  }
}
