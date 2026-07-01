/**
 * Guide book (G): a full-screen reference generated from the game's own data,
 * so the controls and every recipe stay accurate as the game grows. Three
 * tabs: How to play, Crafting, Controls.
 */
import { ATLAS_TILES, TILE_PX } from '../engine/atlas';
import { RECIPES, type Recipe } from '../world/crafting';
import { blockName } from '../world/blocks';
import { iconTileFor, isBlockId, itemName } from '../world/items';
import { CONTROLS } from './controls';

const ICON_PX = 28;

function nameFor(id: number): string {
  return isBlockId(id) ? blockName(id) : itemName(id);
}

const HOW_TO: ReadonlyArray<readonly [string, string]> = [
  ['Gather wood', 'Hold left-click on a tree trunk to break logs. Logs craft into planks, planks into sticks.'],
  ['First tools', 'Craft a wood pickaxe (3 planks + 2 sticks) in the inventory (E). Pickaxes mine stone families faster.'],
  ['Stone up', 'Mine stone (drops cobblestone) and craft a stone pickaxe — fast enough to mine ore.'],
  ['Build a furnace', 'Craft a furnace from 8 cobblestone, place it down, then open the inventory while standing next to it.'],
  ['Smelt metal', 'With a furnace nearby and fuel (logs, planks or charcoal), smelt ore into iron ingots — then craft an iron pickaxe.'],
  ['Survive', 'Hunt animals for meat (left-click), eat meat (right-click) to heal. Falls over 3 blocks hurt; water breaks a fall.'],
  ['Farm', 'Breaking grass sometimes drops seeds. Till grass or dirt with a hoe (right-click), plant seeds on the farmland, and harvest once the stalks turn amber — grain bakes into bread.'],
  ['Explore', 'Caves darken with depth — bring blocks to wall off drops. Different biomes (forest, desert, snowy, savanna) ring the world.'],
];

export class Guide {
  visible = false;
  private readonly root: HTMLDivElement;
  private readonly tabs: Record<string, HTMLDivElement> = {};
  private readonly tabButtons: Record<string, HTMLButtonElement> = {};
  private atlasCanvas: HTMLCanvasElement | null = null;
  private active = 'How to play';

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'guide-screen';
    this.root.className = 'menu-screen hidden';
    const panel = document.createElement('div');
    panel.className = 'menu-panel guide-panel';

    const heading = document.createElement('h1');
    heading.textContent = 'Voxelheim Guide';

    const tabBar = document.createElement('div');
    tabBar.className = 'guide-tabs';
    const body = document.createElement('div');
    body.className = 'guide-body';

    for (const tab of ['How to play', 'Crafting', 'Controls'] as const) {
      const button = document.createElement('button');
      button.textContent = tab;
      button.addEventListener('click', () => this.select(tab));
      tabBar.appendChild(button);
      this.tabButtons[tab] = button;
      const page = document.createElement('div');
      page.className = 'guide-page';
      body.appendChild(page);
      this.tabs[tab] = page;
    }

    const hint = document.createElement('p');
    hint.className = 'controls-hint';
    hint.textContent = 'G / Esc: close';

    panel.append(heading, tabBar, body, hint);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
  }

  open(atlasCanvas: HTMLCanvasElement): void {
    this.atlasCanvas = atlasCanvas;
    this.visible = true;
    this.root.classList.remove('hidden');
    this.renderHowTo();
    this.renderCrafting();
    this.renderControls();
    this.select(this.active);
  }

  close(): void {
    this.visible = false;
    this.root.classList.add('hidden');
  }

  private select(tab: string): void {
    this.active = tab;
    for (const [name, page] of Object.entries(this.tabs)) {
      page.style.display = name === tab ? 'block' : 'none';
      this.tabButtons[name]?.classList.toggle('active', name === tab);
    }
  }

  private icon(id: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = ICON_PX;
    canvas.height = ICON_PX;
    const ctx = canvas.getContext('2d');
    if (ctx && this.atlasCanvas && id > 0) {
      ctx.imageSmoothingEnabled = false;
      const tile = iconTileFor(id);
      const sx = (tile % ATLAS_TILES) * TILE_PX;
      const sy = Math.floor(tile / ATLAS_TILES) * TILE_PX;
      ctx.drawImage(this.atlasCanvas, sx, sy, TILE_PX, TILE_PX, 0, 0, ICON_PX, ICON_PX);
    }
    return canvas;
  }

  private renderHowTo(): void {
    const page = this.tabs['How to play'];
    if (!page) return;
    page.textContent = '';
    for (const [title, text] of HOW_TO) {
      const entry = document.createElement('div');
      entry.className = 'guide-howto';
      const h = document.createElement('strong');
      h.textContent = title;
      const p = document.createElement('span');
      p.textContent = ` — ${text}`;
      entry.append(h, p);
      page.appendChild(entry);
    }
  }

  private recipeRow(recipe: Recipe): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'guide-recipe';
    row.appendChild(this.icon(recipe.output));
    const arrow = document.createElement('span');
    arrow.className = 'guide-arrow';
    arrow.textContent = `${recipe.outputCount}× ${recipe.name}  ⟵`;
    row.appendChild(arrow);
    for (const input of recipe.inputs) {
      const ing = document.createElement('span');
      ing.className = 'guide-ingredient';
      ing.appendChild(this.icon(input.id));
      const label = document.createElement('span');
      label.textContent = `${input.count} ${nameFor(input.id)}`;
      ing.appendChild(label);
      row.appendChild(ing);
    }
    if (recipe.station === 'smelt') {
      const note = document.createElement('span');
      note.className = 'guide-smelt-note';
      note.textContent = '🔥 furnace + fuel';
      row.appendChild(note);
    }
    return row;
  }

  private renderCrafting(): void {
    const page = this.tabs['Crafting'];
    if (!page) return;
    page.textContent = '';
    for (const station of ['craft', 'smelt'] as const) {
      const title = document.createElement('h2');
      title.textContent = station === 'craft' ? 'Crafting' : 'Smelting (needs a furnace)';
      page.appendChild(title);
      for (const recipe of RECIPES) {
        if (recipe.station === station) page.appendChild(this.recipeRow(recipe));
      }
    }
  }

  private renderControls(): void {
    const page = this.tabs['Controls'];
    if (!page) return;
    page.textContent = '';
    for (const [keys, action] of CONTROLS) {
      const row = document.createElement('div');
      row.className = 'panel-row';
      const k = document.createElement('span');
      k.className = 'panel-label key';
      k.textContent = keys;
      const a = document.createElement('span');
      a.className = 'panel-value';
      a.textContent = action;
      row.append(k, a);
      page.appendChild(row);
    }
  }
}
