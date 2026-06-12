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
    for (let id = 1; id <= Block.goldOre; id++) {
      if (BREAKABLE[id] === 1) expect(BREAK_TIME[id]).toBeGreaterThan(0);
    }
  });
});

describe('hunger', () => {
  const flatWorld: WorldView = {
    isSolid: (_x, y, _z) => y <= 9,
    getBlock: () => Block.air,
  };

  function survivalPlayer(): PlayerController {
    const c = new PlayerController();
    c.setMode('survival');
    c.setSpawn(0.5, 11, 0.5);
    c.teleport(0.5, 11, 0.5);
    return c;
  }

  it('drains faster while sprinting than standing still', () => {
    const idle = survivalPlayer();
    const idleInput = new FakeInput();
    for (let i = 0; i < 60 * 120; i++) idle.fixedUpdate(idleInput, flatWorld, DT);

    const runner = survivalPlayer();
    const runInput = new FakeInput();
    runInput.downs.add('KeyW');
    runInput.downs.add('ControlLeft');
    for (let i = 0; i < 60 * 120; i++) runner.fixedUpdate(runInput, flatWorld, DT);

    expect(runner.hunger).toBeLessThan(idle.hunger);
    expect(runner.hunger).toBeLessThan(20); // sprinting clearly burns food
    expect(idle.hunger).toBeLessThanOrEqual(20);
  });

  it('eating restores hunger up to the cap', () => {
    const c = survivalPlayer();
    c.hunger = 4;
    c.eat(6);
    expect(c.hunger).toBe(10);
    c.eat(99);
    expect(c.hunger).toBe(20);
  });

  it('regenerates health when well-fed and wounded', () => {
    const c = survivalPlayer();
    c.hp = 10;
    c.hunger = 20;
    const input = new FakeInput();
    for (let i = 0; i < 60 * 12; i++) c.fixedUpdate(input, flatWorld, DT); // 12s
    expect(c.hp).toBeGreaterThan(10);
  });

  it('starves down to a non-lethal floor when empty', () => {
    const c = survivalPlayer();
    c.hp = 20;
    c.hunger = 0;
    const input = new FakeInput();
    for (let i = 0; i < 60 * 120; i++) c.fixedUpdate(input, flatWorld, DT); // 120s
    expect(c.hp).toBe(1); // starvation never kills outright
    expect(c.hunger).toBe(0);
  });
});

describe('death handling', () => {
  function survivalPlayer(): PlayerController {
    const c = new PlayerController();
    c.setMode('survival');
    c.setSpawn(0.5, 90, 0.5);
    c.teleport(0.5, 70, 0.5);
    return c;
  }

  it('with an onDeath handler, lethal damage freezes the player (no auto-respawn)', () => {
    const c = survivalPlayer();
    let deaths = 0;
    c.onDeath = () => deaths++;
    c.hp = 3;
    // Drive a lethal fall: drop from a great height onto a floor.
    const world: WorldView = { isSolid: (_x, y, _z) => y <= 9, getBlock: () => Block.air };
    c.teleport(0.5, 60, 0.5);
    const input = new FakeInput();
    for (let i = 0; i < 600 && !c.dead; i++) c.fixedUpdate(input, world, DT);
    expect(c.dead).toBe(true);
    expect(deaths).toBe(1);
    expect(c.hp).toBe(0);
    // Frozen: further updates don't move or revive it.
    const y = c.body.y;
    for (let i = 0; i < 60; i++) c.fixedUpdate(input, world, DT);
    expect(c.body.y).toBe(y);
    expect(c.dead).toBe(true);
    // respawn() restores vitals and position.
    c.respawn();
    expect(c.dead).toBe(false);
    expect(c.hp).toBe(MAX_HP);
    expect(c.body.x).toBe(0.5);
    expect(c.body.y).toBe(90);
  });

  it('without a handler, auto-respawns (back-compat)', () => {
    const c = survivalPlayer();
    c.hp = 1;
    c.hurt(20);
    expect(c.dead).toBe(false);
    expect(c.hp).toBe(MAX_HP);
    expect(c.body.y).toBe(90);
  });
});
