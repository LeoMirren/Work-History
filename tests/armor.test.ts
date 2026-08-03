/**
 * Armor: damage-reduction math, crafting recipes, and the controller applying
 * a worn vest's reduction to incoming damage.
 */
import { describe, expect, it } from 'vitest';
import { armorReductionOf, isArmor, mitigatedDamage, Item } from '../src/world/items';
import { craft, RECIPES } from '../src/world/crafting';
import { Inventory } from '../src/player/inventory';
import { PlayerController } from '../src/player/controller';

function recipe(name: string) {
  const r = RECIPES.find((r) => r.name === name);
  if (!r) throw new Error(`missing recipe ${name}`);
  return r;
}

describe('armor reduction', () => {
  it('classifies vests and reports their reduction', () => {
    expect(isArmor(Item.ironVest)).toBe(true);
    expect(isArmor(Item.gemVest)).toBe(true);
    expect(isArmor(Item.ironPickaxe)).toBe(false);
    expect(isArmor(0)).toBe(false);
    expect(armorReductionOf(Item.ironVest)).toBeCloseTo(0.35);
    expect(armorReductionOf(Item.goldVest)).toBeCloseTo(0.5);
    expect(armorReductionOf(Item.gemVest)).toBeCloseTo(0.7);
    expect(armorReductionOf(Item.stick)).toBe(0);
  });

  it('mitigates damage but never below 1 on a real hit', () => {
    expect(mitigatedDamage(10, 0)).toBe(10);
    expect(mitigatedDamage(10, Item.ironVest)).toBe(7); // round(10*0.65)
    expect(mitigatedDamage(10, Item.gemVest)).toBe(3); // round(10*0.30)
    expect(mitigatedDamage(2, Item.gemVest)).toBe(1); // floored at 1
    expect(mitigatedDamage(0, Item.gemVest)).toBe(0); // no hit, no damage
  });
});

describe('armor crafting', () => {
  it('crafts each vest from its metal/gem', () => {
    const iron = new Inventory();
    iron.add(Item.ingot, 5);
    expect(craft(iron, recipe('iron vest'), { furnaceAvailable: false })).toBe(true);
    expect(iron.countOf(Item.ironVest)).toBe(1);

    const gem = new Inventory();
    gem.add(Item.gem, 5);
    expect(craft(gem, recipe('gem vest'), { furnaceAvailable: false })).toBe(true);
    expect(gem.countOf(Item.gemVest)).toBe(1);
  });
});

describe('controller armor mitigation', () => {
  it('reduces mob damage when a vest is worn', () => {
    const bare = new PlayerController();
    bare.setMode('survival');
    bare.hurt(8);
    expect(bare.hp).toBe(12);

    const armored = new PlayerController();
    armored.setMode('survival');
    armored.armorReduction = armorReductionOf(Item.gemVest); // 0.7
    armored.hurt(8);
    expect(armored.hp).toBe(20 - 2); // round(8*0.3) = 2
  });

  it('still ignores damage entirely in creative', () => {
    const c = new PlayerController();
    c.setMode('creative');
    c.armorReduction = 0;
    c.hurt(10);
    expect(c.hp).toBe(20);
  });
});
