/**
 * Auto-run (T): hands-free forward movement that S or a second T cancels —
 * the trackpad-friendly answer to steering while running.
 */
import { describe, expect, it } from 'vitest';
import { PlayerController, type WorldView } from '../src/player/controller';
import { Block } from '../src/world/blocks';

const flat: WorldView = {
  isSolid: (_x, y) => y <= 9,
  getBlock: (_x, y) => (y <= 9 ? Block.stone : Block.air),
};

/** A minimal ControlInput: `pressed` fires once, `held` persists. */
function fakeInput(pressed: Set<string>, held: Set<string>) {
  return {
    isDown: (code: string) => held.has(code),
    takePressed: (code: string) => pressed.delete(code),
  };
}

describe('auto-run', () => {
  it('T toggles hands-free forward movement; S cancels it', () => {
    const p = new PlayerController();
    p.teleport(0.5, 10, 0.5);
    const startZ = p.body.z;

    // Toggle on with T, then run several steps with NO movement key held.
    p.fixedUpdate(fakeInput(new Set(['KeyT']), new Set()), flat, 1 / 60);
    expect(p.autoRun).toBe(true);
    for (let i = 0; i < 60; i++) p.fixedUpdate(fakeInput(new Set(), new Set()), flat, 1 / 60);
    expect(p.body.z).toBeLessThan(startZ - 2); // yaw 0 runs toward -Z

    // Holding S brakes and cancels the latch.
    p.fixedUpdate(fakeInput(new Set(), new Set(['KeyS'])), flat, 1 / 60);
    expect(p.autoRun).toBe(false);

    // A second T press turns it back on; a third turns it off.
    p.fixedUpdate(fakeInput(new Set(['KeyT']), new Set()), flat, 1 / 60);
    expect(p.autoRun).toBe(true);
    p.fixedUpdate(fakeInput(new Set(['KeyT']), new Set()), flat, 1 / 60);
    expect(p.autoRun).toBe(false);
  });
});
