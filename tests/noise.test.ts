import { describe, expect, it } from 'vitest';
import { cyrb128, hash2, mulberry32, rngFromSeed, seededNoise2D } from '../src/world/noise';

describe('seeded randomness', () => {
  it('cyrb128 is stable and seed-sensitive', () => {
    expect(cyrb128('hello')).toEqual(cyrb128('hello'));
    expect(cyrb128('hello')).not.toEqual(cyrb128('hello!'));
  });

  it('mulberry32 produces a deterministic stream in [0,1)', () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('rngFromSeed salts produce independent streams', () => {
    expect(rngFromSeed('s', 'a')()).not.toBe(rngFromSeed('s', 'b')());
    expect(rngFromSeed('s', 'a')()).toBe(rngFromSeed('s', 'a')());
  });

  it('seeded simplex noise is deterministic and bounded', () => {
    const n1 = seededNoise2D('world', 'hills');
    const n2 = seededNoise2D('world', 'hills');
    for (let i = 0; i < 50; i++) {
      const v = n1(i * 0.13, i * 0.37);
      expect(v).toBe(n2(i * 0.13, i * 0.37));
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });

  it('hash2 is order-independent and uint32', () => {
    const h = hash2(42, -10, 7);
    expect(h).toBe(hash2(42, -10, 7));
    expect(h).not.toBe(hash2(42, 7, -10));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(h)).toBe(true);
  });
});
