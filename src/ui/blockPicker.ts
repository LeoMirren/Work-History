/**
 * Creative block picker (E in creative mode): a grid of every placeable
 * block, drawn from the atlas; clicking one loads it into the selected
 * hotbar slot. The palette itself is pure data for testability.
 */
import { ATLAS_TILES, TILE_PX } from '../engine/atlas';
import { Block, BLOCK_DEFS, blockName } from '../world/blocks';
import { iconTileFor } from '../world/items';
import { isCrop } from '../world/farming';

const ICON_PX = 44;

/** Every placeable block: all defs except air and mid-growth crops. */
export const PICKER_BLOCKS: readonly number[] = BLOCK_DEFS.filter(
  (d) => d.id !== Block.air && !isCrop(d.id),
).map((d) => d.id);

export class BlockPicker {
  visible = false;
  /** A block was chosen for the current hotbar slot. */
  onPick: ((id: number) => void) | null = null;
  private readonly root: HTMLDivElement;
  private readonly grid: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'block-picker';
    this.root.className = 'menu-screen hidden';
    const panel = document.createElement('div');
    panel.className = 'menu-panel picker-panel';
    const heading = document.createElement('h1');
    heading.textContent = 'Blocks';
    const hint = document.createElement('p');
    hint.className = 'tagline';
    hint.textContent = 'click a block to load it into the selected hotbar slot';
    this.grid = document.createElement('div');
    this.grid.className = 'picker-grid';
    panel.append(heading, hint, this.grid);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
  }

  open(atlasCanvas: HTMLCanvasElement): void {
    this.grid.textContent = '';
    for (const id of PICKER_BLOCKS) {
      const cell = document.createElement('button');
      cell.className = 'picker-cell';
      cell.title = blockName(id);
      const icon = document.createElement('canvas');
      icon.width = ICON_PX;
      icon.height = ICON_PX;
      const ctx = icon.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        const tile = iconTileFor(id);
        const sx = (tile % ATLAS_TILES) * TILE_PX;
        const sy = Math.floor(tile / ATLAS_TILES) * TILE_PX;
        ctx.drawImage(atlasCanvas, sx, sy, TILE_PX, TILE_PX, 0, 0, ICON_PX, ICON_PX);
      }
      cell.appendChild(icon);
      cell.addEventListener('click', () => this.onPick?.(id));
      this.grid.appendChild(cell);
    }
    this.root.classList.remove('hidden');
    this.visible = true;
  }

  close(): void {
    this.root.classList.add('hidden');
    this.visible = false;
  }
}
