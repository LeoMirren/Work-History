/**
 * Creative catalogue (E in creative mode): every placeable block plus every
 * item in the game, drawn from the atlas. Clicking a block loads it into the
 * selected hotbar slot; clicking an item hands a stack to the game (main
 * routes it into the survival inventory). The palettes are pure data for
 * testability.
 */
import { ATLAS_TILES, TILE_PX } from '../engine/atlas';
import { Block, BLOCK_DEFS, blockName } from '../world/blocks';
import { iconTileFor, isBlockId, itemName, PICKER_ITEMS } from '../world/items';
import { isCrop } from '../world/farming';

const ICON_PX = 44;

/** Every placeable block: all defs except air and mid-growth crops. */
export const PICKER_BLOCKS: readonly number[] = BLOCK_DEFS.filter(
  (d) => d.id !== Block.air && !isCrop(d.id),
).map((d) => d.id);

export class BlockPicker {
  visible = false;
  /** A block or item was chosen (main routes by isBlockId). */
  onPick: ((id: number) => void) | null = null;
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'block-picker';
    this.root.className = 'menu-screen hidden';
    const panel = document.createElement('div');
    panel.className = 'menu-panel picker-panel';
    const heading = document.createElement('h1');
    heading.textContent = 'Catalogue';
    const hint = document.createElement('p');
    hint.className = 'tagline';
    hint.textContent = 'blocks load into the selected hotbar slot · items drop a stack into your inventory';
    this.body = document.createElement('div');
    this.body.className = 'picker-body';
    panel.append(heading, hint, this.body);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
  }

  /** One icon-grid section with a small header. */
  private section(title: string, ids: readonly number[], atlasCanvas: HTMLCanvasElement): void {
    const head = document.createElement('h2');
    head.className = 'picker-section';
    head.textContent = title;
    const grid = document.createElement('div');
    grid.className = 'picker-grid';
    for (const id of ids) {
      const cell = document.createElement('button');
      cell.className = 'picker-cell';
      cell.title = isBlockId(id) ? blockName(id) : itemName(id);
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
      grid.appendChild(cell);
    }
    this.body.append(head, grid);
  }

  open(atlasCanvas: HTMLCanvasElement): void {
    this.body.textContent = '';
    this.section('Blocks', PICKER_BLOCKS, atlasCanvas);
    this.section('Items', PICKER_ITEMS, atlasCanvas);
    this.root.classList.remove('hidden');
    this.visible = true;
  }

  close(): void {
    this.root.classList.add('hidden');
    this.visible = false;
  }
}
