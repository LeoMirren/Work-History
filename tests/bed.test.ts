/**
 * Beds: the day/night sleep helpers (pure) and the bed crafting recipe.
 */
import { describe, expect, it } from 'vitest';
import {
  brightnessAt,
  DAY_LENGTH_SECONDS,
  isNightTime,
  NOON_TIME,
  nextDay,
  SLEEP_BRIGHTNESS,
} from '../src/engine/daynight';
import { craft, RECIPES } from '../src/world/crafting';
import { Inventory } from '../src/player/inventory';
import { Item } from '../src/world/items';
import { Block } from '../src/world/blocks';

describe('sleep helpers', () => {
  it('classifies night vs day by brightness', () => {
    expect(isNightTime(NOON_TIME)).toBe(false); // noon is bright
    const midnight = DAY_LENGTH_SECONDS * 0.75; // trough of the curve
    expect(isNightTime(midnight)).toBe(true);
    expect(brightnessAt(midnight)).toBeLessThan(SLEEP_BRIGHTNESS);
  });

  it('nextDay jumps strictly forward into a bright morning', () => {
    const midnight = DAY_LENGTH_SECONDS * 0.75;
    const morning = nextDay(midnight);
    expect(morning).toBeGreaterThan(midnight);
    expect(isNightTime(morning)).toBe(false);
    expect(brightnessAt(morning)).toBeGreaterThan(0.8);
  });

  it('always advances even when called repeatedly', () => {
    let t = DAY_LENGTH_SECONDS * 0.8;
    const first = nextDay(t);
    t = first;
    const second = nextDay(t);
    expect(second).toBeGreaterThan(first);
    expect(second - first).toBeCloseTo(DAY_LENGTH_SECONDS);
  });
});

describe('bed recipe', () => {
  it('crafts from planks and a sapling', () => {
    const recipe = RECIPES.find((r) => r.name === 'bed');
    expect(recipe).toBeDefined();
    const inv = new Inventory();
    inv.add(Block.planks, 4);
    inv.add(Item.sapling, 1);
    expect(craft(inv, recipe!, { furnaceAvailable: false })).toBe(true);
    expect(inv.countOf(Block.bed)).toBe(1);
    expect(inv.countOf(Block.planks)).toBe(0);
    expect(inv.countOf(Item.sapling)).toBe(0);
  });
});
