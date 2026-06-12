/**
 * HUD: crosshair, hotbar with atlas-drawn icons, F3 debug overlay (§4.9).
 * Pure DOM/CSS — no engine dependencies beyond the atlas canvas for icons.
 */
import { FACE_TILES, HOTBAR_BLOCKS, blockName } from '../world/blocks';
import { ATLAS_TILES, TILE_PX } from '../engine/atlas';

const ICON_PX = 40;

export class Hud {
  selectedSlot = 0;
  private readonly slots: HTMLDivElement[] = [];
  private readonly overlay: HTMLDivElement;
  private debugVisible = true;

  constructor(parent: HTMLElement, atlasCanvas: HTMLCanvasElement) {
    const crosshair = document.createElement('div');
    crosshair.id = 'crosshair';
    parent.appendChild(crosshair);

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
      slot.appendChild(icon);
      hotbar.appendChild(slot);
      this.slots.push(slot);
    }
    parent.appendChild(hotbar);
    this.redrawIcons(atlasCanvas);

    this.overlay = document.createElement('div');
    this.overlay.id = 'debug-overlay';
    parent.appendChild(this.overlay);

    this.selectSlot(0);
  }

  get selectedBlock(): number {
    return HOTBAR_BLOCKS[this.selectedSlot] ?? 0;
  }

  /** (Re)draw slot icons from an atlas canvas — used after world switches. */
  redrawIcons(atlasCanvas: HTMLCanvasElement): void {
    for (let i = 0; i < this.slots.length; i++) {
      const blockId = HOTBAR_BLOCKS[i] ?? 0;
      const icon = this.slots[i]?.querySelector('canvas');
      const ctx = icon?.getContext('2d');
      if (!ctx) continue;
      ctx.imageSmoothingEnabled = false;
      // Side-face tile reads best as an icon (grass band, bark, etc.).
      const tile = FACE_TILES[blockId * 6] ?? 0;
      const sx = (tile % ATLAS_TILES) * TILE_PX;
      const sy = Math.floor(tile / ATLAS_TILES) * TILE_PX;
      ctx.clearRect(0, 0, ICON_PX, ICON_PX);
      ctx.drawImage(atlasCanvas, sx, sy, TILE_PX, TILE_PX, 0, 0, ICON_PX, ICON_PX);
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

  toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
    this.overlay.style.display = this.debugVisible ? 'block' : 'none';
  }

  setDebugText(text: string): void {
    if (this.debugVisible) this.overlay.textContent = text;
  }
}
