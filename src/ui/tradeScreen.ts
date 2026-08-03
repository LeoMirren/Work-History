/**
 * Barter screen: a compact list of villager trade offers. Each row shows the
 * cost stack → the reward stack with a Trade button that is enabled only
 * while the player can afford the cost; the game itself performs the swap
 * through the injected onTrade callback and this screen just re-renders.
 */
import { ATLAS_TILES, TILE_PX } from '../engine/atlas';
import { type Inventory } from '../player/inventory';
import { iconTileFor, itemName, isBlockId } from '../world/items';
import { blockName } from '../world/blocks';

const ICON_PX = 36;

function nameFor(id: number): string {
  return isBlockId(id) ? blockName(id) : itemName(id);
}

/**
 * One villager offer: pay `give`, receive `get`. Declared structurally here
 * so any offer source with the same shape can be passed straight in.
 */
export interface TradeOffer {
  readonly give: { readonly id: number; readonly count: number };
  readonly get: { readonly id: number; readonly count: number };
}

/** Per-row elements that change as the inventory mutates. */
interface TradeRowEls {
  readonly button: HTMLButtonElement;
  readonly have: HTMLDivElement;
}

export class TradeScreen {
  visible = false;
  private readonly root: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly rowEls: TradeRowEls[] = [];
  private offers: readonly TradeOffer[] = [];
  private inventory: Inventory | null = null;
  private atlasCanvas: HTMLCanvasElement | null = null;
  private onTrade: ((offerIndex: number) => void) | null = null;
  private renderedVersion = -1;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'trade-screen';
    this.root.className = 'menu-screen hidden';
    const panel = document.createElement('div');
    panel.className = 'menu-panel';
    const heading = document.createElement('h1');
    heading.textContent = 'Barter';

    this.list = document.createElement('div');
    this.list.id = 'trade-list';

    const hint = document.createElement('p');
    hint.className = 'controls-hint';
    hint.textContent = 'click Trade to swap goods · E/Esc: close';
    panel.append(heading, this.list, hint);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
  }

  open(
    offers: readonly TradeOffer[],
    inventory: Inventory,
    atlasCanvas: HTMLCanvasElement,
    onTrade: (offerIndex: number) => void,
  ): void {
    this.offers = offers;
    this.inventory = inventory;
    this.atlasCanvas = atlasCanvas;
    this.onTrade = onTrade;
    this.renderedVersion = -1;
    this.visible = true;
    this.buildRows();
    this.root.classList.remove('hidden');
    this.render();
  }

  close(): void {
    this.visible = false;
    this.offers = [];
    this.inventory = null;
    this.onTrade = null;
    this.root.classList.add('hidden');
  }

  /** Rebuild one row per offer; the static parts (icons, counts) draw once. */
  private buildRows(): void {
    this.list.textContent = '';
    this.rowEls.length = 0;
    this.offers.forEach((offer, index) => {
      const row = document.createElement('div');
      row.className = 'trade-row';
      row.title = `${offer.give.count} ${nameFor(offer.give.id)} → ${offer.get.count} ${nameFor(offer.get.id)}`;

      const button = document.createElement('button');
      button.className = 'trade-btn';
      button.textContent = 'Trade';
      button.addEventListener('click', () => {
        if (!this.onTrade) return;
        this.onTrade(index);
        this.render();
      });

      const have = document.createElement('div');
      have.className = 'trade-have';

      row.append(
        this.makeIcon(offer.give),
        this.makeCount(offer.give.count),
        this.makeArrow(),
        this.makeIcon(offer.get),
        this.makeCount(offer.get.count),
        button,
        have,
      );
      this.list.appendChild(row);
      this.rowEls.push({ button, have });
    });
  }

  private makeIcon(stack: TradeOffer['give']): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = ICON_PX;
    canvas.height = ICON_PX;
    canvas.title = `${nameFor(stack.id)} ×${stack.count}`;
    this.drawIcon(canvas, stack.id);
    return canvas;
  }

  private makeCount(count: number): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = 'trade-count';
    span.textContent = `×${count}`;
    return span;
  }

  private makeArrow(): HTMLSpanElement {
    const arrow = document.createElement('span');
    arrow.className = 'trade-arrow';
    arrow.textContent = '→';
    return arrow;
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

  /** Repaint affordability + owned counts; cheap enough to run on mutation. */
  render(): void {
    const inv = this.inventory;
    if (!this.visible || !inv) return;
    this.renderedVersion = inv.version;
    for (let i = 0; i < this.offers.length; i++) {
      const offer = this.offers[i];
      const els = this.rowEls[i];
      if (!offer || !els) continue;
      const owned = inv.countOf(offer.give.id);
      els.button.disabled = owned < offer.give.count;
      els.have.textContent = `you have ${owned}`;
    }
  }

  /** Re-render if the inventory changed under us (e.g. pickups mid-barter). */
  refreshIfStale(): void {
    if (this.visible && this.inventory && this.inventory.version !== this.renderedVersion) {
      this.render();
    }
  }
}
