/**
 * Creature skins: procedural grayscale hide/fur/scale/cloth/stone patterns
 * that give entity boxes texture and baked top-light shading, so mobs read as
 * living volumes instead of flat plastic. The pattern is a colour-independent
 * grayscale MULTIPLIER map (final = pattern × material colour × scene light),
 * so one texture per kind serves every tint and the hurt-flash emissive still
 * works untouched. Headless (no DOM, e.g. tests) transparently falls back to
 * flat-coloured materials, so nothing here needs a browser to construct.
 */
import * as THREE from 'three';

export type SkinKind = 'fur' | 'hide' | 'scale' | 'cloth' | 'stone';

const hasDOM = typeof document !== 'undefined';
const cache = new Map<SkinKind, THREE.Texture>();

/** Grayscale value 0..255 for a pixel of `kind` at (x, y) in a 16px tile. */
function skinPixel(kind: SkinKind, x: number, y: number, r: () => number): number {
  // Soft top-light gradient shared by every kind: brighter up top (~1.0),
  // shading down to ~0.8 at the bottom — the cheap fake-AO that reads as form.
  const grad = 255 * (1 - (y / 15) * 0.2);
  switch (kind) {
    case 'fur': {
      // Faint vertical streaks plus fine grain.
      const streak = (x % 3 === 0 ? -10 : 0) + (r() < 0.3 ? -14 : 0);
      return grad + streak + (r() - 0.5) * 16;
    }
    case 'hide':
      return grad + (r() - 0.5) * 10; // smooth, faint mottle
    case 'scale': {
      // Small offset cells with darker seams.
      const cell = ((x + (Math.floor(y / 3) % 2) * 1) % 3 === 0) || y % 3 === 0;
      return grad + (cell ? -26 : 0) + (r() - 0.5) * 12;
    }
    case 'cloth': {
      // A woven cross-hatch.
      const weave = (x % 2 === 0 ? 8 : -8) + (y % 2 === 0 ? 8 : -8);
      return grad + weave + (r() - 0.5) * 8;
    }
    case 'stone':
      return grad + (r() < 0.12 ? -34 : 0) + (r() - 0.5) * 20;
    default:
      return grad;
  }
}

/** Build (and cache) the grayscale pattern texture for a skin kind. */
function patternTexture(kind: SkinKind): THREE.Texture | null {
  if (!hasDOM) return null;
  const cached = cache.get(kind);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(16, 16);
  // A small deterministic PRNG so the grain is stable per session.
  let s = 0x9e3779b9 ^ kind.length;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = Math.max(0, Math.min(255, skinPixel(kind, x, y, rand)));
      const o = (y * 16 + x) * 4;
      img.data[o] = v;
      img.data[o + 1] = v;
      img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  cache.set(kind, tex);
  return tex;
}

/**
 * A Lambert material tinted `color` and textured with the `kind` pattern.
 * The hurt-flash emissive and any `.color` tweaks keep working (the pattern
 * only multiplies brightness). Falls back to a plain material without a DOM.
 */
export function hideMaterial(color: THREE.Color | number, kind: SkinKind): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ color });
  const tex = patternTexture(kind);
  if (tex) material.map = tex;
  return material;
}
