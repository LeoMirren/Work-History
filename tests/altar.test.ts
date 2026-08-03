/**
 * Tyrant shrines and their prize: the altarFor locator, the shrine carver,
 * the Hollow Tyrant's spec/loot, and the heartstone max-health boost.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BOSS_SPECS, BossSystem, tyrantLoot } from '../src/entities/boss';
import { altarFor, tryCarveAltarShrine } from '../src/world/worldgen';
import { blockIndex, CHUNK_SIZE, CHUNK_VOLUME } from '../src/world/chunk';
import { Block } from '../src/world/blocks';
import { Item } from '../src/world/items';
import { PlayerController } from '../src/player/controller';
import { MAX_HP } from '../src/player/physics';

describe('the Hollow Tyrant', () => {
  it('is the fastest great boss and answers only the altar', () => {
    const spec = BOSS_SPECS.hollowTyrant;
    expect(spec.speed).toBeGreaterThan(BOSS_SPECS.sunkenKing.speed);
    expect(spec.enragedSpeed).toBeGreaterThan(BOSS_SPECS.stoneColossus.enragedSpeed);
    const sys = new BossSystem(new THREE.Scene(), () => 0.5);
    expect(sys.summon(0, 12, 0, 'hollowTyrant')).toBe(true);
    expect(sys.name).toBe('The Hollow Tyrant');
    expect(sys.height).toBe(spec.height);
  });

  it('drops its eye, heartstones and dusk metal', () => {
    const drops = tyrantLoot(() => 0.5);
    expect(drops.filter((d) => d.id === Item.tyrantEye).length).toBe(1);
    const hearts = drops.filter((d) => d.id === Item.heartstone).length;
    expect(hearts).toBeGreaterThanOrEqual(2);
    expect(hearts).toBeLessThanOrEqual(3);
    expect(drops.some((d) => d.id === Item.duskIngot)).toBe(true);
    expect(drops.some((d) => d.id === Item.gem)).toBe(true);
  });
});

describe('altar shrines', () => {
  it('altarFor is deterministic and points inside the hosting chunk', () => {
    expect(altarFor(31337, 5, -9)).toEqual(altarFor(31337, 5, -9));
    for (let cx = 0; cx < 400; cx++) {
      const hit = altarFor(31337, cx, 2);
      if (!hit) continue;
      expect(hit.x).toBeGreaterThanOrEqual(cx * CHUNK_SIZE);
      expect(hit.x).toBeLessThan((cx + 1) * CHUNK_SIZE);
      expect(hit.y).toBeGreaterThanOrEqual(42); // ALTAR_MIN_Y + 2
      expect(hit.y).toBeLessThanOrEqual(90); // ALTAR_MAX_Y + 2
      return;
    }
    throw new Error('no shrine in 400 chunks — chance roll broken');
  });

  it('carves the vault with a dais, a glowing altar and braziers', () => {
    const data = new Uint8Array(CHUNK_VOLUME);
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        data[blockIndex(x, 0, z)] = Block.bedrock;
        for (let y = 1; y <= 90; y++) data[blockIndex(x, y, z)] = Block.stone;
      }
    }
    // hash 0: floor at ALTAR_MIN_Y = 40, origin (1, 1).
    tryCarveAltarShrine(data, 0, 1, 1);
    expect(data[blockIndex(4, 42, 4)]).toBe(Block.altar); // dais centre
    expect(data[blockIndex(4, 41, 4)]).toBe(Block.mossstone); // dais
    expect(data[blockIndex(2, 43, 4)]).toBe(Block.air); // vault interior
    expect(data[blockIndex(2, 41, 2)]).toBe(Block.emberrock); // brazier
    // Bails untouched when there is no cover above the vault.
    const thin = new Uint8Array(CHUNK_VOLUME);
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let y = 0; y <= 10; y++) thin[blockIndex(x, y, z)] = Block.stone;
      }
    }
    const before = thin.slice();
    tryCarveAltarShrine(thin, 0, 1, 1);
    expect(thin).toEqual(before);
  });
});

describe('heartstone boosts', () => {
  it('raise max health and every clamp follows', () => {
    const p = new PlayerController();
    expect(p.maxHp).toBe(MAX_HP);
    p.maxHp += 2; // what the use-chain does per heartstone
    p.hp = Math.min(p.maxHp, p.hp + 2);
    expect(p.hp).toBe(22);
    p.hurt(30); // survivable? no — but respawn restores the boosted max
    expect(p.hp === 0 || p.dead === false).toBe(true);
    p.respawn();
    expect(p.hp).toBe(22);
    // heal() clamps to the boosted max, not the base MAX_HP.
    p.hurt(4);
    p.heal(50);
    expect(p.hp).toBe(22);
  });
});
