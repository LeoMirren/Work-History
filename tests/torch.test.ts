/**
 * Torches: an accessible early-game light (coal + stick, no furnace).
 */
import { describe, expect, it } from 'vitest';
import { craft, RECIPES } from '../src/world/crafting';
import { Inventory } from '../src/player/inventory';
import { Block, LIGHT_EMIT } from '../src/world/blocks';
import { Item } from '../src/world/items';

describe('torch', () => {
  it('emits light, but dimmer than a lantern', () => {
    expect(LIGHT_EMIT[Block.torch]).toBe(12);
    expect(LIGHT_EMIT[Block.torch]).toBeLessThan(LIGHT_EMIT[Block.lantern]);
  });

  it('crafts 4 from coal + a stick, with no furnace needed', () => {
    const recipe = RECIPES.find((r) => r.name === 'torches');
    expect(recipe).toBeDefined();
    expect(recipe!.station).toBe('craft');
    const inv = new Inventory();
    inv.add(Item.coal, 1);
    inv.add(Item.stick, 1);
    expect(craft(inv, recipe!, { furnaceAvailable: false })).toBe(true);
    expect(inv.countOf(Block.torch)).toBe(4);
    expect(inv.countOf(Item.coal)).toBe(0);
    expect(inv.countOf(Item.stick)).toBe(0);
  });
});
