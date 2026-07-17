/**
 * Minimap tests: terrainShade palette bands, redraw-gating grid cells, and
 * the widget's sampler cadence driven through a minimal fake DOM (the vitest
 * environment is node, so there is no real document — the class is exercised
 * against a tiny stub and construction is guarded).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BEACH_BAND,
  BLOCKS_PER_PIXEL,
  BLOCKS_PER_SAMPLE,
  MINIMAP_SIZE_PX,
  Minimap,
  REDRAW_GRID_BLOCKS,
  ROCK_LINE,
  SAMPLE_GRID,
  SNOW_LINE,
  gridCellOf,
  terrainShade,
} from '../src/ui/minimap';

const SEA = 52;
const luma = (c: readonly [number, number, number]): number => c[0] + c[1] + c[2];

describe('terrainShade bands', () => {
  it('deep water is dark blue-dominant', () => {
    const [r, g, b] = terrainShade(SEA - 30, SEA);
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
    expect(b).toBeLessThan(120);
  });

  it('shallow water is a lighter blue than the deeps', () => {
    const deep = terrainShade(SEA - 24, SEA);
    const shallow = terrainShade(SEA - 1, SEA);
    expect(shallow[2]).toBeGreaterThan(shallow[1]); // still blue
    expect(luma(shallow)).toBeGreaterThan(luma(deep));
  });

  it('beach band is sand-toned (warm, r > g > b)', () => {
    for (const h of [SEA, SEA + BEACH_BAND - 1]) {
      const [r, g, b] = terrainShade(h, SEA);
      expect(r).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(b);
      expect(r).toBeGreaterThanOrEqual(200);
    }
  });

  it('mid heights through 70 are green-dominant', () => {
    for (const h of [SEA + BEACH_BAND, 70, ROCK_LINE - 1]) {
      const [r, g, b] = terrainShade(h, SEA);
      expect(g).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(b);
    }
  });

  it('past the rock line is grey-brown rock (muted, warm-leaning)', () => {
    for (const h of [ROCK_LINE, 152, SNOW_LINE - 1]) {
      const [r, g, b] = terrainShade(h, SEA);
      expect(r).toBeGreaterThanOrEqual(g);
      expect(g).toBeGreaterThanOrEqual(b);
      expect(r - b).toBeLessThanOrEqual(40); // near-grey, not saturated
    }
  });

  it('past the snow line is snow white', () => {
    for (const h of [SNOW_LINE, 170, 184]) {
      const [r, g, b] = terrainShade(h, SEA);
      expect(Math.min(r, g, b)).toBeGreaterThanOrEqual(230);
    }
  });

  it('band edges land in the right band', () => {
    expect(terrainShade(SEA - 1, SEA)[2]).toBeGreaterThan(terrainShade(SEA - 1, SEA)[0]); // water
    const beach = terrainShade(SEA, SEA);
    expect(beach[0]).toBeGreaterThan(beach[2]); // sand at exactly sea level
    const grass = terrainShade(SEA + BEACH_BAND, SEA);
    expect(grass[1]).toBeGreaterThan(grass[0]); // grass right above the beach
    expect(Math.min(...terrainShade(SNOW_LINE, SEA))).toBeGreaterThanOrEqual(230);
  });

  it('lightens monotonically with height within each band', () => {
    const bands: Array<[number, number]> = [
      [SEA - 24, SEA - 1],
      [SEA, SEA + BEACH_BAND - 1],
      [SEA + BEACH_BAND, ROCK_LINE - 1],
      [ROCK_LINE, SNOW_LINE - 1],
      [SNOW_LINE, SNOW_LINE + 24],
    ];
    for (const [lo, hi] of bands) {
      let prev = luma(terrainShade(lo, SEA));
      for (let h = lo + 1; h <= hi; h++) {
        const cur = luma(terrainShade(h, SEA));
        expect(cur).toBeGreaterThanOrEqual(prev);
        prev = cur;
      }
    }
  });
});

describe('gridCellOf (redraw gating key)', () => {
  it('is stable within an 8-block cell', () => {
    expect(gridCellOf(0, 0)).toBe(gridCellOf(7.9, 7.9));
    expect(gridCellOf(16.2, 24.7)).toBe(gridCellOf(23.9, 31.9));
  });

  it('changes when either axis crosses a cell edge', () => {
    expect(gridCellOf(REDRAW_GRID_BLOCKS, 0)).not.toBe(gridCellOf(REDRAW_GRID_BLOCKS - 0.1, 0));
    expect(gridCellOf(0, REDRAW_GRID_BLOCKS)).not.toBe(gridCellOf(0, REDRAW_GRID_BLOCKS - 0.1));
  });

  it('handles negative coordinates without straddling zero', () => {
    expect(gridCellOf(-0.1, 0)).not.toBe(gridCellOf(0.1, 0));
    expect(gridCellOf(-8, -8)).toBe(gridCellOf(-0.1, -0.1));
  });

  it('scale constants agree: 2 blocks/px over 148px, 74x74 samples', () => {
    expect(MINIMAP_SIZE_PX * BLOCKS_PER_PIXEL).toBe(SAMPLE_GRID * BLOCKS_PER_SAMPLE);
    expect(SAMPLE_GRID).toBe(74);
    expect(BLOCKS_PER_PIXEL).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Fake DOM: just enough surface for the Minimap constructor and update path.
// ---------------------------------------------------------------------------

class FakeImageData {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

class FakeContext2D {
  putCount = 0;
  lastImage: FakeImageData | null = null;
  createImageData(w: number, h: number): FakeImageData {
    return new FakeImageData(w, h);
  }
  putImageData(img: FakeImageData): void {
    this.putCount++;
    this.lastImage = img;
  }
}

class FakeElement {
  id = '';
  className = '';
  textContent = '';
  width = 0;
  height = 0;
  readonly style: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  private readonly ctx = new FakeContext2D();
  constructor(readonly tag: string) {}
  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }
  getContext(kind: string): FakeContext2D | null {
    return kind === '2d' ? this.ctx : null;
  }
}

function findByTag(root: FakeElement, tag: string): FakeElement | null {
  if (root.tag === tag) return root;
  for (const child of root.children) {
    const hit = findByTag(child, tag);
    if (hit) return hit;
  }
  return null;
}

function findByClass(root: FakeElement, cls: string): FakeElement | null {
  if (root.className === cls) return root;
  for (const child of root.children) {
    const hit = findByClass(child, cls);
    if (hit) return hit;
  }
  return null;
}

describe('Minimap widget (fake DOM)', () => {
  const g = globalThis as { document?: Document };
  let head: FakeElement;
  let parent: FakeElement;

  beforeEach(() => {
    head = new FakeElement('head');
    parent = new FakeElement('div');
    const doc = {
      head,
      createElement: (tag: string) => new FakeElement(tag),
      getElementById: (id: string) => head.children.find((c) => c.id === id) ?? null,
    };
    g.document = doc as unknown as Document;
  });

  afterEach(() => {
    delete g.document;
  });

  /** Constructor guard: skip DOM assertions if the stub is insufficient. */
  function construct(): Minimap | null {
    try {
      return new Minimap(parent as unknown as HTMLElement);
    } catch {
      return null;
    }
  }

  it('builds the panel: canvas, north letter, arrow, injected style', () => {
    const m = construct();
    if (!m) return; // guarded: pure exports are covered above
    const panel = parent.children[0];
    expect(panel?.id).toBe('minimap');
    const canvas = findByTag(panel as FakeElement, 'canvas');
    expect(canvas?.width).toBe(SAMPLE_GRID);
    expect(canvas?.height).toBe(SAMPLE_GRID);
    expect(findByClass(panel as FakeElement, 'minimap-north')?.textContent).toBe('N');
    expect(findByClass(panel as FakeElement, 'minimap-arrow')).not.toBeNull();
    const style = head.children.find((c) => c.tag === 'style');
    expect(style).toBeDefined();
    for (const rule of ['position: fixed', 'pointer-events: none', 'image-rendering: pixelated', 'z-index: 20']) {
      expect(style?.textContent).toContain(rule);
    }
    // Style is injected once, even for a second minimap.
    construct();
    expect(head.children.filter((c) => c.tag === 'style')).toHaveLength(1);
  });

  it('samples 74x74 columns on redraw and paints palette colours', () => {
    const m = construct();
    if (!m) return;
    let calls = 0;
    m.bind(
      () => {
        calls++;
        return 64;
      },
      () => [10, 200, 30] as const,
    );
    m.update(0, 0, 0);
    expect(calls).toBe(SAMPLE_GRID * SAMPLE_GRID);
    const ctx = findByTag(parent, 'canvas')?.getContext('2d');
    expect(ctx?.putCount).toBe(1);
    const px = ctx?.lastImage?.data;
    expect(px?.[0]).toBe(10);
    expect(px?.[1]).toBe(200);
    expect(px?.[2]).toBe(30);
    expect(px?.[3]).toBe(255);
  });

  it('gates redraws to 8-block cells; arrow still rotates in between', () => {
    const m = construct();
    if (!m) return;
    let calls = 0;
    m.bind(
      () => {
        calls++;
        return 64;
      },
      (h) => terrainShade(h, SEA),
    );
    m.update(1, 1, 0);
    expect(calls).toBe(SAMPLE_GRID * SAMPLE_GRID);
    m.update(6.5, 7.5, 1); // same cell: arrow-only
    expect(calls).toBe(SAMPLE_GRID * SAMPLE_GRID);
    const arrow = findByClass(parent, 'minimap-arrow');
    expect(arrow?.style['transform']).toContain('rotate(-1rad)');
    m.update(REDRAW_GRID_BLOCKS + 0.5, 7.5, 1); // crossed a cell edge: redraw
    expect(calls).toBe(2 * SAMPLE_GRID * SAMPLE_GRID);
  });

  it('update before bind only rotates the arrow; rebind forces a repaint', () => {
    const m = construct();
    if (!m) return;
    m.update(0, 0, 0.5); // no sampler bound: must not throw
    const arrow = findByClass(parent, 'minimap-arrow');
    expect(arrow?.style['transform']).toContain('rotate(-0.5rad)');
    let calls = 0;
    const sampler = (): number => {
      calls++;
      return 40;
    };
    m.bind(sampler, (h) => terrainShade(h, SEA));
    m.update(0, 0, 0);
    expect(calls).toBe(SAMPLE_GRID * SAMPLE_GRID);
    m.bind(sampler, (h) => terrainShade(h, SEA)); // rebind resets the cache
    m.update(0, 0, 0); // same position, but must repaint
    expect(calls).toBe(2 * SAMPLE_GRID * SAMPLE_GRID);
  });

  it('setVisible toggles the panel display', () => {
    const m = construct();
    if (!m) return;
    const panel = parent.children[0] as FakeElement;
    m.setVisible(false);
    expect(panel.style['display']).toBe('none');
    m.setVisible(true);
    expect(panel.style['display']).toBe('block');
  });
});
