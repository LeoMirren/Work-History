/**
 * The armory: piece slots, stacked reduction with a hard cap, and the
 * craft recipes that complete every metal's set.
 */
import { describe, expect, it } from 'vitest';
import { armorPieceOf, ARMOR_TOTAL_CAP, Item, totalArmorReduction } from '../src/world/items';
import { RECIPES } from '../src/world/crafting';

describe('armor pieces', () => {
  it('classifies every piece into its slot', () => {
    expect(armorPieceOf(Item.duskVest)).toBe('vest');
    expect(armorPieceOf(Item.gemHelm)).toBe('helm');
    expect(armorPieceOf(Item.ironBoots)).toBe('boots');
    expect(armorPieceOf(Item.duskblade)).toBeNull();
  });

  it('stacks reductions and caps a full dusk set at the hard ceiling', () => {
    const singles = totalArmorReduction([Item.ironVest]);
    expect(singles).toBeCloseTo(0.35, 5);
    const pair = totalArmorReduction([Item.ironVest, Item.ironHelm]);
    expect(pair).toBeCloseTo(0.53, 5);
    const fullDusk = totalArmorReduction([Item.duskVest, Item.duskHelm, Item.duskBoots]);
    expect(fullDusk).toBe(ARMOR_TOTAL_CAP); // 1.45 raw -> capped
    expect(fullDusk).toBeLessThan(1);
  });

  it('every metal has craftable helm and boots', () => {
    const names = new Set(RECIPES.map((r) => r.name));
    for (const metal of ['iron', 'gold', 'silver', 'gem', 'dusksteel']) {
      expect(names.has(`${metal} helm`)).toBe(true);
      expect(names.has(`${metal} boots`)).toBe(true);
    }
  });
});
