/**
 * Damage feedback: flash spike/decay and low-health vignette intensity.
 */
import { describe, expect, it } from 'vitest';
import { HurtIndicator, LOW_HP_THRESHOLD } from '../src/player/feedback';

describe('HurtIndicator flash', () => {
  it('spikes on a hit and decays to zero over time', () => {
    const h = new HurtIndicator();
    expect(h.flash).toBe(0);
    h.hit(4);
    expect(h.flash).toBeGreaterThan(0);
    const afterHit = h.flash;
    for (let i = 0; i < 120; i++) h.update(1 / 60); // ~2s
    expect(h.flash).toBe(0);
    expect(afterHit).toBeGreaterThan(0);
  });

  it('bigger hits flash harder, clamped to 1', () => {
    const small = new HurtIndicator();
    small.hit(1);
    const big = new HurtIndicator();
    big.hit(10);
    expect(big.flash).toBeGreaterThan(small.flash);
    const huge = new HurtIndicator();
    huge.hit(1000);
    expect(huge.flash).toBeLessThanOrEqual(1);
  });
});

describe('HurtIndicator overlay intensity', () => {
  it('is zero at full health with no flash', () => {
    const h = new HurtIndicator();
    expect(h.intensity(20, 20)).toBe(0);
  });

  it('shows a steady vignette below the low-hp threshold', () => {
    const h = new HurtIndicator();
    expect(h.intensity(LOW_HP_THRESHOLD, 20)).toBe(0); // exactly at threshold: none yet
    const low = h.intensity(2, 20);
    expect(low).toBeGreaterThan(0);
    expect(h.intensity(1, 20)).toBeGreaterThan(low); // lower hp -> stronger
  });

  it('combines flash and vignette, capped', () => {
    const h = new HurtIndicator();
    h.hit(1000);
    expect(h.intensity(1, 20)).toBeLessThanOrEqual(0.85);
    expect(h.intensity(1, 20)).toBeGreaterThan(h.intensity(20, 20));
  });
});
