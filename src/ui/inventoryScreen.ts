/**
 * Survival inventory screen (E): 27 main slots + the 9 hotbar slots, click
 * to move/merge/swap stacks (shift-click quick-moves between regions), and a
 * recipe book that crafts straight from available materials.
 */
import { ATLAS_TILES, TILE_PX } from '../engine/atlas';
import { craft, craftableCount, RECIPES } from '../world/crafting';
import { iconTileFor, itemName, isBlockId, isArmor } from '../world/items';
import { blockName } from '../world/blocks';
import { HOTBAR_SIZE, INVENTORY_SIZE, type Inventory } from '../player/inventory';
import { Cursor } from '../player/cursor';

const ICON_PX = 36;

function nameFor(id: number): string {
  return isBlockId(id) ? blockName(id) : itemName(id);
}

export class InventoryScreen {
  visible = false;
  /** Fired when a recipe is successfully made (station distinguishes craft/smelt). */
  onMake: ((name: string, station: 'craft' | 'smelt') => void) | null = null;
  private readonly root: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly recipeList: HTMLDivElement;
  private readonly slotEls: HTMLDivElement[] = [];
  private inventory: Inventory | null = null;
  private armor: Inventory | null = null;
  private readonly armorSlotEl: HTMLDivElement = document.createElement('div');
  private atlasCanvas: HTMLCanvasElement | null = null;
  private readonly cursor = new Cursor();
  private readonly heldLabel: HTMLDivElement = document.createElement('div');
  private renderedVersion = -1;
  private furnaceAvailable = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'inventory-screen';
    this.root.className = 'menu-screen hidden';
    const panel = document.createElement('div');
    panel.className = 'menu-panel inventory-panel';
    const heading = document.createElement('h1');
    heading.textContent = 'Inventory';

    // Worn-armor slot (single).
    const armorRow = document.createElement('div');
    armorRow.className = 'armor-row';
    const armorLabel = document.createElement('span');
    armorLabel.textContent = 'Armor';
    this.armorSlotEl.className = 'inv-slot armor-slot';
    const armorIcon = document.createElement('canvas');
    armorIcon.width = ICON_PX;
    armorIcon.height = ICON_PX;
    this.armorSlotEl.appendChild(armorIcon);
    this.armorSlotEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.onArmorClick(e.button);
    });
    armorRow.append(armorLabel, this.armorSlotEl);

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
      slot.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.onSlotClick(index, e.button, e.shiftKey);
      });
      this.grid.appendChild(slot);
      this.slotEls[index] = slot;
    }

    this.recipeList = document.createElement('div');
    this.recipeList.id = 'recipe-list';

    columns.append(this.grid, this.recipeList);
    this.heldLabel.className = 'held-label';
    const hint = document.createElement('p');
    hint.className = 'controls-hint';
    hint.textContent =
      'left: pick up / drop · right: half / drop one · shift-click: quick-move · E/Esc: close';
    panel.append(heading, armorRow, columns, this.heldLabel, hint);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
  }

  open(
    inventory: Inventory,
    armor: Inventory,
    atlasCanvas: HTMLCanvasElement,
    furnaceAvailable: boolean,
  ): void {
    this.inventory = inventory;
    this.armor = armor;
    this.atlasCanvas = atlasCanvas;
    this.furnaceAvailable = furnaceAvailable;
    this.renderedVersion = -1;
    this.visible = true;
    this.root.classList.remove('hidden');
    this.render();
  }

  /** Armor slot accepts only armor items; left-click equips/unequips/swaps. */
  private onArmorClick(button: number): void {
    const armor = this.armor;
    if (!armor || button !== 0) return;
    const held = this.cursor.held;
    if (held && !isArmor(held.id)) return; // junk can't be worn
    this.cursor.leftClick(armor, 0);
    this.render();
  }

  close(): void {
    if (this.inventory) this.cursor.returnTo(this.inventory);
    this.visible = false;
    this.inventory = null;
    this.root.classList.add('hidden');
  }

  private onSlotClick(index: number, button: number, shift: boolean): void {
    const inv = this.inventory;
    if (!inv) return;
    if (shift && button === 0) {
      inv.quickMove(index);
    } else if (button === 2) {
      this.cursor.rightClick(inv, index);
    } else if (button === 0) {
      this.cursor.leftClick(inv, index);
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
    }
    const held = this.cursor.held;
    this.heldLabel.textContent = held ? `Holding: ${nameFor(held.id)} ×${held.count}` : '';

    // Armor slot.
    const worn = this.armor?.slots[0] ?? null;
    const armorIcon = this.armorSlotEl.querySelector('canvas');
    if (armorIcon) this.drawIcon(armorIcon, worn?.id ?? 0);
    this.armorSlotEl.title = worn ? nameFor(worn.id) : 'armor';

    this.recipeList.textContent = '';
    const ctx = { furnaceAvailable: this.furnaceAvailable };
    if (!this.furnaceAvailable) {
      const note = document.createElement('div');
      note.className = 'smelt-hint';
      note.textContent = 'Stand by a furnace to smelt.';
      this.recipeList.appendChild(note);
    }
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
      label.textContent = `${recipe.name} ×${recipe.outputCount}${recipe.station === 'smelt' ? ' 🔥' : ''}`;
      label.title = recipe.station === 'smelt' ? `${ingredients} (furnace + fuel)` : ingredients;
      const button = document.createElement('button');
      const times = craftableCount(inv, recipe, ctx);
      button.textContent = times > 0 ? `Make (${times})` : recipe.station === 'smelt' ? 'Smelt' : 'Craft';
      button.disabled = times === 0;
      button.addEventListener('click', () => {
        if (craft(inv, recipe, ctx)) {
          this.onMake?.(recipe.name, recipe.station);
          this.render();
        }
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
