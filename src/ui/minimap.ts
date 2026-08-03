/**
 * Minimap: top-down exploration map in a small glass panel, bottom-left.
 * Pure DOM/canvas — main binds a height sampler and a colour palette, so
 * this module imports nothing from the world/engine layers.
 *
 * Scale: 2 world blocks per CSS pixel over a 148px panel (~296-block span).
 * The canvas backing store is 74x74 samples (4 blocks/sample) scaled up with
 * image-rendering: pixelated, so a full redraw costs 74*74 sampler calls.
 * Redraws are gated to an 8-block grid: while the player stays inside one
 * cell only the yaw arrow rotates (a single CSS transform write).
 */

/** CSS size of the square panel, in pixels. */
export const MINIMAP_SIZE_PX = 148;
/** World blocks represented by one CSS pixel. */
export const BLOCKS_PER_PIXEL = 2;
/** Canvas backing-store resolution: samples per axis on a full redraw. */
export const SAMPLE_GRID = 74;
/** World blocks between adjacent samples (296-block span / 74 samples). */
export const BLOCKS_PER_SAMPLE = (MINIMAP_SIZE_PX * BLOCKS_PER_PIXEL) / SAMPLE_GRID;
/** Side of the world-space grid whose cells gate full redraws. */
export const REDRAW_GRID_BLOCKS = 8;

/** Height sampler for one world column, supplied by main. */
export type HeightSampler = (wx: number, wz: number) => number;
/** Maps a terrain height to an rgb triple, each channel 0..255. */
export type HeightPalette = (h: number) => readonly [number, number, number];
/** A point of interest to draw on the map (world coords + CSS color). */
export interface MapMarker {
  readonly x: number;
  readonly z: number;
  readonly color: string;
}
/** Supplies the markers inside a world-space rect, called on each redraw. */
export type MarkerSource = (wx0: number, wz0: number, wx1: number, wz1: number) => readonly MapMarker[];

/**
 * Key of the redraw-gating grid cell containing world position (px, pz).
 * The minimap caches the last key and only re-samples the terrain when the
 * player crosses into a different cell. Exported as a pure seam for tests.
 */
export function gridCellOf(px: number, pz: number): string {
  return `${Math.floor(px / REDRAW_GRID_BLOCKS)},${Math.floor(pz / REDRAW_GRID_BLOCKS)}`;
}

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a: number, b: number, t: number): number => Math.round(a + (b - a) * t);

/** Absolute height where grass gives way to grey-brown rock (post-Deepening). */
export const ROCK_LINE = 149;
/** Absolute height where rock gives way to snow (mirrors worldgen's line). */
export const SNOW_LINE = 160;
/** Blocks above the sea surface treated as beach sand. */
export const BEACH_BAND = 3;

/**
 * Default height→colour ramp: deep water dark blue lightening toward the
 * surface, a sand beach band just above sea level, greens rising with
 * altitude, grey-brown rock past ROCK_LINE and snow past SNOW_LINE.
 * Within every band the shade lightens monotonically with height.
 */
export function terrainShade(h: number, seaLevel: number): readonly [number, number, number] {
  if (h < seaLevel) {
    // Water: t=0 in the abyss, t=1 just below the surface.
    const t = clamp01(1 - (seaLevel - h) / 24);
    return [lerp(8, 40, t), lerp(22, 96, t), lerp(64, 178, t)] as const;
  }
  if (h < seaLevel + BEACH_BAND) {
    // Beach: warm sand, brightening slightly up the strand.
    const t = clamp01((h - seaLevel) / BEACH_BAND);
    return [lerp(204, 222, t), lerp(184, 202, t), lerp(138, 154, t)] as const;
  }
  if (h < ROCK_LINE) {
    // Grass: lowland dark green → brighter highland green through ~70.
    const t = clamp01((h - (seaLevel + BEACH_BAND)) / (ROCK_LINE - (seaLevel + BEACH_BAND)));
    return [lerp(54, 116, t), lerp(118, 178, t), lerp(46, 82, t)] as const;
  }
  if (h < SNOW_LINE) {
    // Rock: grey-brown, paling toward the snow line.
    const t = clamp01((h - ROCK_LINE) / (SNOW_LINE - ROCK_LINE));
    return [lerp(120, 172, t), lerp(107, 162, t), lerp(92, 150, t)] as const;
  }
  // Snow: near-white, still creeping brighter with altitude.
  const t = clamp01((h - SNOW_LINE) / 24);
  const v = lerp(235, 254, t);
  return [v, v, Math.min(255, v + 1)] as const;
}

const STYLE_ID = 'minimap-style';

/** Inject the minimap's stylesheet once (glass panel matching the HUD). */
function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#minimap {
  position: fixed;
  left: 14px;
  bottom: 14px;
  width: ${MINIMAP_SIZE_PX}px;
  height: ${MINIMAP_SIZE_PX}px;
  pointer-events: none;
  z-index: 20;
  border: 1px solid rgba(255, 184, 77, 0.22);
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(17, 22, 42, 0.8), rgba(7, 9, 19, 0.88));
  box-shadow:
    0 10px 26px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(0, 0, 0, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  overflow: hidden;
}
#minimap canvas {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  opacity: 0.94;
}
#minimap .minimap-north {
  position: absolute;
  top: 3px;
  left: 50%;
  transform: translateX(-50%);
  font: 700 10px/1 system-ui, sans-serif;
  letter-spacing: 0.08em;
  color: rgba(233, 238, 251, 0.85);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
}
#minimap .minimap-arrow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 10px solid rgba(255, 216, 143, 0.95);
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7));
  transform: translate(-50%, -55%) rotate(0rad);
}
`;
  document.head.appendChild(style);
}

/**
 * The minimap widget. Construct with the HUD parent element, then bind()
 * a sampler + palette and call update() once per frame from the game loop.
 */
export class Minimap {
  private readonly panel: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly arrow: HTMLDivElement;
  private sampler: HeightSampler | null = null;
  private palette: HeightPalette | null = null;
  private markers: MarkerSource | null = null;
  /** Grid-cell key of the last full redraw; null forces one on next update. */
  private lastCell: string | null = null;

  constructor(parent: HTMLElement) {
    injectStyles();
    this.panel = document.createElement('div');
    this.panel.id = 'minimap';

    this.canvas = document.createElement('canvas');
    this.canvas.width = SAMPLE_GRID;
    this.canvas.height = SAMPLE_GRID;
    this.ctx = this.canvas.getContext('2d');
    this.panel.appendChild(this.canvas);

    const north = document.createElement('div');
    north.className = 'minimap-north';
    north.textContent = 'N';
    this.panel.appendChild(north);

    this.arrow = document.createElement('div');
    this.arrow.className = 'minimap-arrow';
    this.panel.appendChild(this.arrow);

    parent.appendChild(this.panel);
  }

  /**
   * Supply the terrain height sampler and the height→colour palette.
   * Resets the redraw cache so the next update() repaints immediately.
   */
  bind(sampler: HeightSampler, palette: HeightPalette): void {
    this.sampler = sampler;
    this.palette = palette;
    this.lastCell = null;
  }

  /** Supply (or clear) the structure-marker source; repaints on next update. */
  bindMarkers(markers: MarkerSource | null): void {
    this.markers = markers;
    this.lastCell = null;
  }

  /**
   * Per-frame: rotate the player arrow to yaw (cheap CSS write), and fully
   * re-sample the terrain only when (px, pz) crosses an 8-block grid cell.
   * Drawn north-up (-Z at the top), so the arrow rotates by -yaw.
   */
  update(px: number, pz: number, yaw: number): void {
    this.arrow.style.transform = `translate(-50%, -55%) rotate(${-yaw}rad)`;
    if (!this.sampler || !this.palette || !this.ctx) return;
    const cell = gridCellOf(px, pz);
    if (cell === this.lastCell) return;
    this.lastCell = cell;
    this.redraw(px, pz);
  }

  /** Show or hide the whole panel. */
  setVisible(v: boolean): void {
    this.panel.style.display = v ? 'block' : 'none';
  }

  /**
   * Full repaint: 74x74 height samples around the player, centred on the
   * current redraw cell so the image is stable within a cell. North-up:
   * canvas rows run +Z (south) downward, columns +X (east) rightward.
   */
  private redraw(px: number, pz: number): void {
    const ctx = this.ctx;
    const sampler = this.sampler;
    const palette = this.palette;
    if (!ctx || !sampler || !palette) return;
    // Snap the map centre to the cell centre so redraws within one cell
    // (there is only ever one) and across re-binds line up on block seams.
    const cx = (Math.floor(px / REDRAW_GRID_BLOCKS) + 0.5) * REDRAW_GRID_BLOCKS;
    const cz = (Math.floor(pz / REDRAW_GRID_BLOCKS) + 0.5) * REDRAW_GRID_BLOCKS;
    const img = ctx.createImageData(SAMPLE_GRID, SAMPLE_GRID);
    const data = img.data;
    const half = SAMPLE_GRID / 2;
    for (let iz = 0; iz < SAMPLE_GRID; iz++) {
      const wz = Math.floor(cz + (iz - half) * BLOCKS_PER_SAMPLE);
      for (let ix = 0; ix < SAMPLE_GRID; ix++) {
        const wx = Math.floor(cx + (ix - half) * BLOCKS_PER_SAMPLE);
        const [r, g, b] = palette(sampler(wx, wz));
        const o = (iz * SAMPLE_GRID + ix) * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Structure markers: villages, roaming titans, buried halls — the map is
    // how you SEE the world's content. Each is a 3-sample dot with a dark
    // outline so it pops on any terrain.
    if (this.markers) {
      const span = half * BLOCKS_PER_SAMPLE;
      for (const m of this.markers(cx - span, cz - span, cx + span, cz + span)) {
        const sx = Math.round((m.x - cx) / BLOCKS_PER_SAMPLE + half);
        const sz = Math.round((m.z - cz) / BLOCKS_PER_SAMPLE + half);
        if (sx < 1 || sz < 1 || sx > SAMPLE_GRID - 2 || sz > SAMPLE_GRID - 2) continue;
        ctx.fillStyle = 'rgba(10, 10, 14, 0.9)';
        ctx.fillRect(sx - 2, sz - 2, 5, 5);
        ctx.fillStyle = m.color;
        ctx.fillRect(sx - 1, sz - 1, 3, 3);
      }
    }
  }
}
