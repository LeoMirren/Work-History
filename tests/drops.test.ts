/**
 * Floating item drops: spawn/settle physics, the player magnet + pickup,
 * lifetime expiry, the live-drop cap and the per-tile geometry cache.
 * Headless — THREE.Scene and BoxGeometry need no WebGL.
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  DROP_LIFETIME_S,
  DROP_REST_OFFSET,
  dropUVsFor,
  ItemDrops,
  MAX_DROPS,
} from '../src/entities/drops';
import { tileUVRect } from '../src/engine/atlas';
import { iconTileFor, Item } from '../src/world/items';
import type { SolidFn } from '../src/player/physics';

const DT = 1 / 60;
/** Player parked far away: neither the magnet nor pickup can trigger. */
const FAR = 1000;
/** Solid ground filling every cell below y=10 (floor surface at y=10). */
const floor10: SolidFn = (_x, y) => y < 10;
/** Deterministic spawn scatter: 0.5 maps to zero horizontal velocity. */
const fixedRandom = (): number => 0.5;

function entityMeshes(scene: THREE.Scene): THREE.Mesh[] {
  return scene.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
}

describe('item drops', () => {
  it('spawns into the scene and stays hidden until the atlas binds', () => {
    const scene = new THREE.Scene();
    const drops = new ItemDrops(scene, fixedRandom);
    drops.spawn(Item.stick, 1, 0.5, 12, 0.5);
    expect(drops.count).toBe(1);
    const [mesh] = entityMeshes(scene);
    expect(mesh?.name).toBe('entity');
    expect(mesh?.visible).toBe(false); // no atlas yet
    drops.setAtlas(new THREE.Texture());
    expect(mesh?.visible).toBe(true); // existing drops revealed
    drops.spawn(Item.stick, 1, 2.5, 12, 2.5);
    expect(entityMeshes(scene)[1]?.visible).toBe(true); // new drops visible
  });

  it('falls under gravity and rests just above a solid floor', () => {
    const scene = new THREE.Scene();
    const drops = new ItemDrops(scene, fixedRandom);
    drops.spawn(Item.stick, 1, 0.5, 14, 0.5);
    for (let i = 0; i < 180; i++) drops.fixedUpdate(DT, floor10, FAR, 0, FAR); // 3 s
    expect(drops.count).toBe(1);
    const [mesh] = entityMeshes(scene);
    // Settled at the rest height above the floor surface, ± the idle bob.
    expect(mesh?.position.y).toBeGreaterThan(10 + DROP_REST_OFFSET - 0.05);
    expect(mesh?.position.y).toBeLessThan(10 + DROP_REST_OFFSET + 0.05);
    expect(mesh?.position.x).toBe(0.5); // no scatter with the fixed rng
  });

  it('magnets toward a nearby player and fires onPickup on contact', () => {
    const scene = new THREE.Scene();
    const drops = new ItemDrops(scene, fixedRandom);
    const onPickup = vi.fn();
    drops.onPickup = onPickup;
    drops.spawn(Item.meat, 3, 0.5, 12, 0.5);
    for (let i = 0; i < 120; i++) drops.fixedUpdate(DT, floor10, FAR, 0, FAR); // settle
    expect(drops.count).toBe(1);
    // Player ~2 blocks away: inside the magnet radius, outside pickup reach.
    for (let i = 0; i < 180 && drops.count > 0; i++) {
      drops.fixedUpdate(DT, floor10, 2.5, 10.5, 0.5);
    }
    expect(onPickup).toHaveBeenCalledTimes(1);
    expect(onPickup).toHaveBeenCalledWith(Item.meat, 3);
    expect(drops.count).toBe(0);
    expect(scene.children.length).toBe(0); // mesh removed
  });

  it('despawns after its lifetime', () => {
    const scene = new THREE.Scene();
    const drops = new ItemDrops(scene, fixedRandom);
    drops.spawn(Item.stick, 1, 0.5, 12, 0.5);
    const steps = Math.ceil((DROP_LIFETIME_S + 0.5) / DT);
    for (let i = 0; i < steps && drops.count > 0; i++) {
      drops.fixedUpdate(DT, floor10, FAR, 0, FAR);
    }
    expect(drops.count).toBe(0);
    expect(scene.children.length).toBe(0);
  });

  it('caps live drops, evicting the oldest first', () => {
    const scene = new THREE.Scene();
    const drops = new ItemDrops(scene, fixedRandom);
    for (let i = 0; i < MAX_DROPS + 2; i++) drops.spawn(Item.stick, 1, i + 0.5, 20, 0.5);
    expect(drops.count).toBe(MAX_DROPS); // 82 spawned -> 80 live
    expect(scene.children.length).toBe(MAX_DROPS);
    // The two earliest spawns (x = 0.5, 1.5) were evicted; x = 2.5 survives.
    const xs = entityMeshes(scene).map((m) => m.position.x);
    expect(xs).not.toContain(0.5);
    expect(xs).not.toContain(1.5);
    expect(xs).toContain(2.5);
  });

  it('shares one cached geometry per atlas tile', () => {
    const scene = new THREE.Scene();
    const drops = new ItemDrops(scene, fixedRandom);
    drops.spawn(Item.stick, 1, 0.5, 20, 0.5);
    drops.spawn(Item.stick, 1, 3.5, 20, 3.5);
    expect(drops.cachedGeometryCount).toBe(1);
    const [a, b] = entityMeshes(scene);
    expect(a?.geometry).toBe(b?.geometry); // same tile -> same reference
    expect(iconTileFor(Item.meat)).not.toBe(iconTileFor(Item.stick)); // sanity
    drops.spawn(Item.meat, 1, 6.5, 20, 6.5);
    expect(drops.cachedGeometryCount).toBe(2);
    drops.clear();
    drops.spawn(Item.stick, 1, 0.5, 20, 0.5);
    expect(drops.cachedGeometryCount).toBe(2); // cache survives clear()
  });

  it('clear removes every drop and mesh (dimension switch)', () => {
    const scene = new THREE.Scene();
    const drops = new ItemDrops(scene, fixedRandom);
    drops.spawn(Item.stick, 1, 0.5, 12, 0.5);
    drops.spawn(Item.meat, 2, 1.5, 12, 1.5);
    expect(drops.count).toBe(2);
    drops.clear();
    expect(drops.count).toBe(0);
    expect(scene.children.length).toBe(0);
  });

  it('UV-pins all six cube faces to the tile rect in BoxGeometry corner order', () => {
    const tile = iconTileFor(Item.stick);
    const { u0, v0, u1, v1 } = tileUVRect(tile);
    const uvs = dropUVsFor(tile);
    expect(uvs).toHaveLength(48);
    for (let face = 0; face < 6; face++) {
      const o = face * 8;
      // Corners in BoxGeometry order (0,1) (1,1) (0,0) (1,0).
      expect(Array.from(uvs.slice(o, o + 8))).toEqual([u0, v1, u1, v1, u0, v0, u1, v0]);
    }
  });
});
