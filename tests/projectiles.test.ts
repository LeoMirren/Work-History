/**
 * Player thrown stones: ballistic flight, terrain stop, lifetime, mob strike.
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ThrownProjectiles, THROW_SPEED } from '../src/entities/projectiles';
import { isThrowable, Item } from '../src/world/items';
import type { SolidFn } from '../src/player/physics';

const DT = 1 / 60;
const openAir: SolidFn = () => false;
const noStrike = () => false;

describe('throwing stone item', () => {
  it('is recognised as throwable', () => {
    expect(isThrowable(Item.throwingStone)).toBe(true);
    expect(isThrowable(Item.ironPickaxe)).toBe(false);
  });
});

describe('thrown projectiles', () => {
  it('flies forward and falls under gravity', () => {
    const scene = new THREE.Scene();
    const sys = new ThrownProjectiles(scene);
    sys.throw(0, 20, 0, 1, 0, 0); // thrown level along +x
    expect(sys.count).toBe(1);
    for (let i = 0; i < 30; i++) sys.fixedUpdate(DT, openAir, noStrike); // 0.5s
    const mesh = scene.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh;
    expect(mesh.position.x).toBeGreaterThan(THROW_SPEED * 0.4); // travelled forward
    expect(mesh.position.y).toBeLessThan(20); // dropped
  });

  it('dies on hitting terrain', () => {
    const scene = new THREE.Scene();
    const sys = new ThrownProjectiles(scene);
    sys.throw(0.5, 5, 0.5, 1, 0, 0);
    const wall: SolidFn = (x) => x >= 3; // a wall a few blocks ahead
    for (let i = 0; i < 120 && sys.count > 0; i++) sys.fixedUpdate(DT, wall, noStrike);
    expect(sys.count).toBe(0);
    expect(scene.children.length).toBe(0); // mesh removed
  });

  it('expires after its lifetime in open air', () => {
    const scene = new THREE.Scene();
    const sys = new ThrownProjectiles(scene);
    sys.throw(0, 200, 0, 0, 1, 0); // straight up, never hits ground for a while
    for (let i = 0; i < 60 * 3; i++) sys.fixedUpdate(DT, openAir, noStrike); // 3s > life
    expect(sys.count).toBe(0);
  });

  it('strikes a mob and is consumed on the hit', () => {
    const scene = new THREE.Scene();
    const sys = new ThrownProjectiles(scene);
    sys.throw(0, 10, 0, 1, 0, 0);
    const strike = vi.fn().mockReturnValueOnce(true); // first sweep hits
    sys.fixedUpdate(DT, openAir, strike);
    expect(strike).toHaveBeenCalledOnce();
    expect(sys.count).toBe(0);
  });

  it('clears all stones on world reset', () => {
    const scene = new THREE.Scene();
    const sys = new ThrownProjectiles(scene);
    sys.throw(0, 10, 0, 1, 0, 0);
    sys.throw(0, 10, 0, 0, 0, 1);
    expect(sys.count).toBe(2);
    sys.clear();
    expect(sys.count).toBe(0);
    expect(scene.children.length).toBe(0);
  });
});
