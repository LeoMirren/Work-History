/**
 * Shellbacks: the fifth hostile archetype — front-armored, flankable.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HostileSystem, SHELLBACK_HP } from '../src/entities/hostiles';
import { Block } from '../src/world/blocks';

const flat = {
  isSolid: (_x: number, y: number) => y <= 9,
  getBlock: (_x: number, y: number) => (y <= 9 ? Block.grass : Block.air),
};

describe('shellbacks', () => {
  it('chip for 1 from the front, take full damage from behind', () => {
    const sys = new HostileSystem(new THREE.Scene(), () => 0.5);
    sys.setWorld(flat);
    const s = sys.spawnAt(0.5, 10, 0.5, false, false, false, false, true);
    expect(s.shelled).toBe(true);
    expect(s.hp).toBe(SHELLBACK_HP);
    // Facing -z (yaw 0): a blow travelling +z comes head-on -> chips for 1.
    s.yaw = 0;
    sys.hurt(s, 0, 1, 6);
    expect(s.hp).toBe(SHELLBACK_HP - 1);
    // A blow travelling -z hits the exposed back -> full damage.
    sys.hurt(s, 0, -1, 6);
    expect(s.hp).toBe(SHELLBACK_HP - 1 - 6);
  });
});
