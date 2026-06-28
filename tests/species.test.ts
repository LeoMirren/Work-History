/**
 * Biome-flavoured wildlife: every biome maps to its species.
 */
import { describe, expect, it } from 'vitest';
import { speciesForBiome, Species } from '../src/entities/animals';
import { Biome } from '../src/world/worldgen';

describe('speciesForBiome', () => {
  const always = () => 0; // forces the temperate "trundler" branch

  it('gives deserts striders and jungles hoppers (no longer barren)', () => {
    expect(speciesForBiome(Biome.desert, always)).toBe(Species.strider);
    expect(speciesForBiome(Biome.jungle, always)).toBe(Species.hopper);
  });

  it('keeps woollies in the snow and trundlers in temperate land', () => {
    expect(speciesForBiome(Biome.snowy, always)).toBe(Species.woolly);
    expect(speciesForBiome(Biome.plains, () => 0.1)).toBe(Species.trundler);
    expect(speciesForBiome(Biome.forest, () => 0.9)).toBe(Species.woolly); // 30% woolly mix
  });

  it('is total over the biome set', () => {
    for (const b of Object.values(Biome)) {
      const s = speciesForBiome(b, () => 0.5);
      expect(Object.values(Species)).toContain(s);
    }
  });
});
