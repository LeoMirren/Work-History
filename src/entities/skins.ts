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

/** Shared radial-gradient shadow texture (built once; null without a DOM). */
let shadowTexture: THREE.Texture | null | undefined;

function getShadowTexture(): THREE.Texture | null {
  if (shadowTexture !== undefined) return shadowTexture;
  if (!hasDOM) return (shadowTexture = null);
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return (shadowTexture = null);
  const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.75, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  shadowTexture = new THREE.CanvasTexture(canvas);
  return shadowTexture;
}

/**
 * A soft blob shadow to sit at an entity group's feet — THE fix for mobs
 * reading as floating cardboard. A flat plane just off the ground, radial
 * gradient, never writing depth. Attach to the group at local y≈0.02 (the
 * group origin rides the body's feet). Headless: an invisible placeholder
 * mesh so rig child-counts and the material sweep stay consistent.
 */
export function shadowBlob(radius: number): THREE.Mesh {
  const tex = getShadowTexture();
  const material = tex
    ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    : new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), material);
  blob.name = 'entity';
  blob.rotation.x = -Math.PI / 2;
  blob.position.set(0, 0.02, 0);
  blob.renderOrder = 1;
  return blob;
}
