/**
 * HUD: crosshair, hotbar with atlas-drawn icons, F3 debug overlay (§4.9).
 * Pure DOM/CSS — no engine dependencies beyond the atlas canvas for icons.
 */
import { HOTBAR_BLOCKS, blockName } from '../world/blocks';
import { iconTileFor, isBlockId, itemName } from '../world/items';
import { ATLAS_TILES, TILE_PX } from '../engine/atlas';
import type { Inventory } from '../player/inventory';

const ICON_PX = 40;

export class Hud {
  selectedSlot = 0;
  /** Creative palette: seeded with the defaults, editable via the block picker. */
  private readonly creativeBlocks: number[] = [...HOTBAR_BLOCKS];
  private readonly slots: HTMLDivElement[] = [];
  private readonly overlay: HTMLDivElement;
  private readonly heartsRow: HTMLDivElement;
  private readonly hearts: HTMLSpanElement[] = [];
  private readonly hungerRow: HTMLDivElement;
  private readonly drumsticks: HTMLSpanElement[] = [];
  private readonly breakBar: HTMLDivElement;
  private readonly breakFill: HTMLDivElement;
  private lastHp = -1;
  private lastHunger = -1;
  private lastBreakPct = -1;
  private debugVisible = true;
  private inventory: Inventory | null = null;
  private atlasCanvas: HTMLCanvasElement | null = null;
  private renderedInvVersion = -1;
  private readonly counts: HTMLSpanElement[] = [];

  constructor(parent: HTMLElement, atlasCanvas: HTMLCanvasElement) {
    const crosshair = document.createElement('div');
    crosshair.id = 'crosshair';
    parent.appendChild(crosshair);

    this.heartsRow = document.createElement('div');
    this.heartsRow.id = 'hearts';
    this.heartsRow.style.display = 'none';
    for (let i = 0; i < 10; i++) {
      const heart = document.createElement('span');
      heart.className = 'heart';
      heart.textContent = '♥';
      this.heartsRow.appendChild(heart);
      this.hearts.push(heart);
    }
    parent.appendChild(this.heartsRow);

    this.hungerRow = document.createElement('div');
    this.hungerRow.id = 'hunger';
    this.hungerRow.style.display = 'none';
    for (let i = 0; i < 10; i++) {
      const pip = document.createElement('span');
      pip.className = 'drumstick';
      pip.textContent = '◆';
      this.hungerRow.appendChild(pip);
      this.drumsticks.push(pip);
    }
    parent.appendChild(this.hungerRow);

    this.breakBar = document.createElement('div');
    this.breakBar.id = 'break-bar';
    this.breakFill = document.createElement('div');
    this.breakFill.id = 'break-fill';
    this.breakBar.appendChild(this.breakFill);
    this.breakBar.style.display = 'none';
    parent.appendChild(this.breakBar);

    const hotbar = document.createElement('div');
    hotbar.id = 'hotbar';
    for (let i = 0; i < HOTBAR_BLOCKS.length; i++) {
      const blockId = HOTBAR_BLOCKS[i] ?? 0;
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      slot.title = `${i + 1}: ${blockName(blockId)}`;
      const icon = document.createElement('canvas');
      icon.width = ICON_PX;
      icon.height = ICON_PX;
      const count = document.createElement('span');
      count.className = 'inv-count';
      slot.append(icon, count);
      hotbar.appendChild(slot);
      this.slots.push(slot);
      this.counts.push(count);
    }
    parent.appendChild(hotbar);
    this.redrawIcons(atlasCanvas);

    this.overlay = document.createElement('div');
    this.overlay.id = 'debug-overlay';
    parent.appendChild(this.overlay);

    this.selectSlot(0);
  }

  get selectedBlock(): number {
    return this.creativeBlocks[this.selectedSlot] ?? 0;
  }

  /** Creative: load a block into a hotbar slot (from the block picker). */
  setCreativeSlot(i: number, id: number): void {
    if (i < 0 || i >= this.creativeBlocks.length) return;
    this.creativeBlocks[i] = id;
    if (this.atlasCanvas) this.redrawIcons(this.atlasCanvas);
  }

  /**
   * Bind the hotbar's source: a survival inventory (slots 0-8 with counts)
   * or null for the fixed creative palette.
   */
  bindInventory(inventory: Inventory | null, atlasCanvas: HTMLCanvasElement): void {
    this.inventory = inventory;
    this.atlasCanvas = atlasCanvas;
    this.renderedInvVersion = -1;
    this.redrawIcons(atlasCanvas);
  }

  /** (Re)draw slot icons — creative palette or live inventory stacks. */
  redrawIcons(atlasCanvas: HTMLCanvasElement): void {
    this.atlasCanvas = atlasCanvas;
    for (let i = 0; i < this.slots.length; i++) {
      const stack = this.inventory?.slots[i] ?? null;
      const id = this.inventory ? (stack?.id ?? 0) : (this.creativeBlocks[i] ?? 0);
      const icon = this.slots[i]?.querySelector('canvas');
      const ctx = icon?.getContext('2d');
      const count = this.counts[i];
      if (!ctx) continue;
      ctx.clearRect(0, 0, ICON_PX, ICON_PX);
      if (id > 0) {
        ctx.imageSmoothingEnabled = false;
        // Side-face tile reads best as an icon (grass band, bark, etc.).
        const tile = iconTileFor(id);
        const sx = (tile % ATLAS_TILES) * TILE_PX;
        const sy = Math.floor(tile / ATLAS_TILES) * TILE_PX;
        ctx.drawImage(atlasCanvas, sx, sy, TILE_PX, TILE_PX, 0, 0, ICON_PX, ICON_PX);
      }
      if (count) count.textContent = stack && stack.count > 1 ? String(stack.count) : '';
      const slot = this.slots[i];
      if (slot) {
        slot.title = this.inventory
          ? stack
            ? `${i + 1}: ${isBlockId(stack.id) ? blockName(stack.id) : itemName(stack.id)} ×${stack.count}`
            : `${i + 1}: empty`
          : `${i + 1}: ${blockName(this.creativeBlocks[i] ?? 0)}`;
      }
    }
    if (this.inventory) this.renderedInvVersion = this.inventory.version;
  }

  /** Per-frame: repaint the hotbar only when the inventory changed. */
  updateHotbar(): void {
    if (this.inventory && this.atlasCanvas && this.inventory.version !== this.renderedInvVersion) {
      this.redrawIcons(this.atlasCanvas);
    }
  }

  selectSlot(i: number): void {
    if (i < 0 || i >= this.slots.length) return;
    this.slots[this.selectedSlot]?.classList.remove('selected');
    this.selectedSlot = i;
    this.slots[i]?.classList.add('selected');
  }

  /** Wheel scroll: positive steps move right, wrapping. */
  stepSlot(steps: number): void {
    const n = this.slots.length;
    this.selectSlot((((this.selectedSlot + steps) % n) + n) % n);
  }

  /** Show/hide the survival widgets (hearts, hunger, break progress). */
  setSurvivalVisible(visible: boolean): void {
    this.heartsRow.style.display = visible ? 'flex' : 'none';
    this.hungerRow.style.display = visible ? 'flex' : 'none';
    if (!visible) this.breakBar.style.display = 'none';
    this.lastHp = -1;
    this.lastHunger = -1;
    this.lastBreakPct = -1;
  }

  /** hp in half-hearts, 0..20. DOM only touched when the value changes. */
  setHealth(hp: number): void {
    if (hp === this.lastHp) return;
    this.lastHp = hp;
    for (let i = 0; i < 10; i++) {
      const heart = this.hearts[i];
      if (!heart) continue;
      heart.className = hp >= (i + 1) * 2 ? 'heart' : hp === i * 2 + 1 ? 'heart half' : 'heart empty';
    }
  }

  /** hunger 0..20, shown as 10 pips (full/half/empty). */
  setHunger(hunger: number): void {
    if (hunger === this.lastHunger) return;
    this.lastHunger = hunger;
    for (let i = 0; i < 10; i++) {
      const pip = this.drumsticks[i];
      if (!pip) continue;
      pip.className =
        hunger >= (i + 1) * 2 ? 'drumstick' : hunger === i * 2 + 1 ? 'drumstick half' : 'drumstick empty';
    }
  }

  /** Survival break progress 0..1; bar hidden at 0. */
  setBreakProgress(progress: number): void {
    const pct = Math.round(progress * 50) * 2; // 2% buckets to limit DOM writes
    if (pct === this.lastBreakPct) return;
    this.lastBreakPct = pct;
    this.breakBar.style.display = pct > 0 ? 'block' : 'none';
    this.breakFill.style.width = `${pct}%`;
  }

  toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
    this.overlay.style.display = this.debugVisible ? 'block' : 'none';
  }

  setDebugText(text: string): void {
    if (this.debugVisible) this.overlay.textContent = text;
  }
}
