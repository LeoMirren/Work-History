/**
 * Game-feel systems: usage hints cover every item kind, hurt knockback and
 * flash decay on entities, and the break-particle pool lifecycle.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Item, usageHintFor } from '../src/world/items';
import { Block } from '../src/world/blocks';
import { AnimalSystem, ANIMAL_HP } from '../src/entities/animals';
import { BreakParticles } from '../src/engine/particles';

describe('usageHintFor', () => {
  it('gives every item family a distinct, actionable hint', () => {
    expect(usageHintFor(0)).toContain('punch');
    expect(usageHintFor(Block.stone)).toContain('place');
    expect(usageHintFor(Item.bread)).toContain('eat');
    expect(usageHintFor(Item.seeds)).toContain('plant');
    expect(usageHintFor(Item.hoe)).toContain('till');
    expect(usageHintFor(Item.sapling)).toContain('tree');
    expect(usageHintFor(Item.bucket)).toContain('scoop');
    expect(usageHintFor(Item.waterBucket)).toContain('pour');
    expect(usageHintFor(Item.throwingStone)).toContain('throw');
    expect(usageHintFor(Item.ironVest)).toContain('armor');
    expect(usageHintFor(Item.ironPickaxe)).toContain('mine');
    expect(usageHintFor(Block.bed)).toContain('sleep');
    expect(usageHintFor(Block.chest)).toContain('store');
  });
});

describe('hurt feedback', () => {
  it('applies a red flash and directional knockback that decays', () => {
    const scene = new THREE.Scene();
    const system = new AnimalSystem(scene, () => 0.4);
    const animal = system.spawnAt(0, 10, 0);
    system.hurt(animal, 1, 0);
    expect(animal.hp).toBe(ANIMAL_HP - 1);
    expect(animal.flash).toBeGreaterThan(0);
    expect(animal.kbX).toBeGreaterThan(0);
    expect(animal.kbZ).toBe(0);
    // Knockback decays across steps (flat solid world far below the animal).
    const solidFloor = { isSolid: () => false, getBlock: () => Block.air };
    system.setWorld(solidFloor);
    const respawned = system.spawnAt(0, 10, 0);
    system.hurt(respawned, 1, 0);
    const kb0 = respawned.kbX;
    system.fixedUpdate(0.1, 0, 10, 0);
    expect(respawned.kbX).toBeLessThan(kb0);
  });

  it('walk animation swings legs only while moving on the ground', () => {
    const scene = new THREE.Scene();
    const system = new AnimalSystem(scene, () => 0.99); // never move, long timers
    system.setWorld({ isSolid: (_x, y) => y < 10, getBlock: () => Block.air });
    const animal = system.spawnAt(0.5, 10, 0.5);
    system.fixedUpdate(0.5, 0.5, 10, 0.5);
    for (const leg of animal.legs) expect(Math.abs(leg.rotation.x)).toBeLessThan(0.01);
  });
});

describe('BreakParticles', () => {
  it('bursts, integrates and expires back to an empty pool', () => {
    const scene = new THREE.Scene();
    const particles = new BreakParticles(scene, () => 0.5);
    expect(particles.count).toBe(0);
    particles.burst(0, 60, 0, 0.5, 0.4, 0.3);
    expect(particles.count).toBeGreaterThan(0);
    particles.update(0.1); // alive mid-flight
    expect(particles.count).toBeGreaterThan(0);
    particles.update(10); // life is well under 10s
    expect(particles.count).toBe(0);
  });
});
