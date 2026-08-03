/**
 * Creative block-picker palette: every real block is offered — including
 * blocks added after the fixed creative hotbar was designed — but never air
 * or mid-growth crop stages.
 */
import { describe, expect, it } from 'vitest';
import { PICKER_BLOCKS } from '../src/ui/blockPicker';
import { Block, BLOCK_DEFS } from '../src/world/blocks';

describe('PICKER_BLOCKS', () => {
  it('offers every block except air and crop stages', () => {
    expect(PICKER_BLOCKS).not.toContain(Block.air);
    expect(PICKER_BLOCKS).not.toContain(Block.cropSprout);
    expect(PICKER_BLOCKS).not.toContain(Block.cropGrowing);
    expect(PICKER_BLOCKS).not.toContain(Block.cropRipe);
    expect(PICKER_BLOCKS.length).toBe(BLOCK_DEFS.length - 4);
  });

  it('includes the post-hotbar additions (torch, chest, furnace, bed...)', () => {
    for (const id of [Block.torch, Block.chest, Block.furnace, Block.bed, Block.brick, Block.riftframe, Block.farmland]) {
      expect(PICKER_BLOCKS).toContain(id);
    }
  });
});
