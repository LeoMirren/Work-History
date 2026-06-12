/**
 * Stretch §9 survival mode: fall-damage math, controller landing behavior
 * (damage, death-respawn, water cancellation), and the break-time table.
 */
import { describe, expect, it } from 'vitest';
import { computeFallDamage, MAX_HP } from '../src/player/physics';
import { PlayerController, type ControlInput, type WorldView } from '../src/player/controller';
import { Block, BREAK_TIME, BREAKABLE } from '../src/world/blocks';

class FakeInput implements ControlInput {
  readonly downs = new Set<string>();
  isDown(code: string): boolean {
    return this.downs.has(code);
  }
  takePressed(): boolean {
    return false;
  }
}

const DT = 1 / 60;

/** Flat solid floor with surface at y=10; optional water pool above it. */
function makeWorld(waterTop = -1): WorldView {
  return {
    isSolid: (_x, y, _z) => y <= 9,
    getBlock: (_x, y, _z) => (y >= 10 && y <= waterTop ? Block.water : Block.air),
  };
}

function dropFrom(height: number, waterTop = -1): PlayerController {
  const c = new PlayerController();
  c.setMode('survival');
  c.setSpawn(0.5, 90, 0.5);
  c.teleport(0.5, 10 + height, 0.5);
  const input = new FakeInput();
  const world = makeWorld(waterTop);
  for (let i = 0; i < 600 && !(c.body.onGround || c.inWater); i++) c.fixedUpdate(input, world, DT);
  // A few settle steps so landing damage applies.
  for (let i = 0; i < 5; i++) c.fixedUpdate(input, world, DT);
  return c;
}

describe('computeFallDamage', () => {
  it('matches the half-heart formula with 3 safe blocks', () => {
    expect(computeFallDamage(0)).toBe(0);
    expect(computeFallDamage(3)).toBe(0);
    expect(computeFallDamage(3.9)).toBe(0);
    expect(computeFallDamage(4)).toBe(1);
    expect(computeFallDamage(4.5)).toBe(1);
    expect(computeFallDamage(10)).toBe(7);
    expect(computeFallDamage(23)).toBe(20);
  });
});

describe('survival controller', () => {
  it('takes fall damage on hard landings', () => {
    const c = dropFrom(10); // 10-block fall -> 7 damage
    expect(c.body.onGround).toBe(true);
    expect(c.hp).toBe(MAX_HP - 7);
  });

  it('takes no damage from safe hops', () => {
    expect(dropFrom(2.5).hp).toBe(MAX_HP);
    expect(dropFrom(3).hp).toBe(MAX_HP);
  });

  it('dies and respawns at spawn with full hp on lethal falls', () => {
    const c = dropFrom(40); // 40-block fall -> 37 damage -> death
    expect(c.hp).toBe(MAX_HP);
    expect(c.body.x).toBe(0.5);
    // Respawned at y=90; the settle steps let gravity act briefly after.
    expect(c.body.y).toBeGreaterThan(89);
    expect(c.body.y).toBeLessThanOrEqual(90);
  });

  it('water landings cancel fall damage', () => {
    const c = dropFrom(25, 12); // 3-deep pool on the floor
    expect(c.inWater).toBe(true);
    expect(c.hp).toBe(MAX_HP);
  });

  it('ignores the fly toggle in survival', () => {
    const c = new PlayerController();
    c.setMode('survival');
    const input = new FakeInput();
    const pressy: ControlInput = {
      isDown: (code) => input.isDown(code),
      takePressed: (code) => code === 'KeyF',
    };
    c.fixedUpdate(pressy, makeWorld(), DT);
    expect(c.flying).toBe(false);
  });
});

describe('break-time table', () => {
  it('is positive for breakables and infinite for bedrock', () => {
    expect(BREAK_TIME[Block.stone]).toBeCloseTo(2.25);
    expect(BREAK_TIME[Block.dirt]).toBeCloseTo(0.75);
    expect(BREAK_TIME[Block.leaves]).toBeCloseTo(0.3);
    expect(BREAK_TIME[Block.bedrock]).toBe(Infinity);
    expect(BREAK_TIME[Block.ore]).toBeCloseTo(3);
    expect(BREAKABLE[Block.bedrock]).toBe(0);
    for (let id = 1; id <= Block.ore; id++) {
      if (BREAKABLE[id] === 1) expect(BREAK_TIME[id]).toBeGreaterThan(0);
    }
  });
});
