/**
 * Schematic build keys: tap a key to place the held block in a cell beside
 * you — no aiming needed — for fast row/wall/pillar laying.
 *
 * Directions are relative to where the player faces but snapped to world
 * cardinals, so a laid row stays straight even as the mouse wanders. The
 * vertical pair ('up'/'down') targets the cell one step out in FRONT at
 * feet±1 rather than directly above/below the player, so U/O-style stacking
 * builds ahead of you and never tries to place inside your own body.
 *
 * Main maps KeyI/J/K/L/U/O to 'front'/'left'/'back'/'right'/'down'/'up' and
 * plays the place sound when tryPlace returns a non-zero block id.
 */
import { isBlockId } from '../world/items';
import { canPlaceAt, type HotbarState } from './interaction';
import type { GameMode } from './controller';
import type { Body } from './physics';

/** The six schematic placement directions, relative to the player's facing. */
export type BuildKey = 'front' | 'back' | 'left' | 'right' | 'up' | 'down';

/** Minimal world surface quick-placement needs (satisfied by World and test fakes). */
export interface BuildWorld {
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: number): void;
}

/**
 * Snap a yaw to the nearest world cardinal, pure for testability. Uses the
 * project's facing convention — forward = (-sin(yaw), -cos(yaw)), see
 * interaction.ts dirX/dirZ — keeping the dominant axis of that vector:
 * yaw 0 → (0,-1), +π/2 → (-1,0), π → (0,1), -π/2 → (1,0). An exact 45°
 * diagonal resolves deterministically to a single axis.
 */
export function cardinalOf(yaw: number): { dx: number; dz: number } {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  if (Math.abs(fx) >= Math.abs(fz)) return { dx: fx >= 0 ? 1 : -1, dz: 0 };
  return { dx: 0, dz: fz >= 0 ? 1 : -1 };
}

/**
 * The world cell a build key targets. The base is the player's feet cell
 * (floor of the feet coords); front/back/left/right pick the horizontally
 * adjacent cell one step out at feet level, while 'up'/'down' target the
 * FRONT cell at feet+1/feet-1 so vertical stacking builds ahead of you.
 */
export function buildTargetFor(
  key: BuildKey,
  yaw: number,
  feetX: number,
  feetY: number,
  feetZ: number,
): { x: number; y: number; z: number } {
  const bx = Math.floor(feetX);
  const by = Math.floor(feetY);
  const bz = Math.floor(feetZ);
  const { dx, dz } = cardinalOf(yaw);
  switch (key) {
    case 'front':
      return { x: bx + dx, y: by, z: bz + dz };
    case 'back':
      return { x: bx - dx, y: by, z: bz - dz };
    // Right = forward turned a quarter clockwise, (dx,dz) → (-dz,dx); matches
    // the KeyD strafe basis (cos yaw, -sin yaw) in controller.ts.
    case 'right':
      return { x: bx - dz, y: by, z: bz + dx };
    case 'left':
      return { x: bx + dz, y: by, z: bz - dx };
    case 'up':
      return { x: bx + dx, y: by + 1, z: bz + dz };
    case 'down':
      return { x: bx + dx, y: by - 1, z: bz + dz };
  }
}

/**
 * Applies build-key presses: resolves the target cell, checks the held block
 * and the §4.8 placement rules, consumes survival stock, edits the world.
 */
export class BuildKeys {
  /**
   * Place the held block toward `key`. Returns the placed block id, or 0 when
   * nothing was placed: the target cell is occupied, out of world bounds or
   * intersects the player, or the hand is empty / holds a non-block item.
   * Survival consumes exactly one item from the selected stack per placement.
   */
  tryPlace(
    key: BuildKey,
    world: BuildWorld,
    body: Body,
    yaw: number,
    hotbar: HotbarState,
    mode: GameMode,
  ): number {
    const { x, y, z } = buildTargetFor(key, yaw, body.x, body.y, body.z);
    if (!canPlaceAt(world.getBlock(x, y, z), x, y, z, body)) return 0;
    if (mode === 'creative') {
      const id = hotbar.creativeBlock;
      if (id <= 0) return 0;
      world.setBlock(x, y, z, id);
      return id;
    }
    const inventory = hotbar.inventory;
    const stack = inventory?.slots[hotbar.slot];
    if (!inventory || !stack || !isBlockId(stack.id)) return 0;
    const id = stack.id; // read before consuming: draining the stack nulls the slot
    if (!inventory.consumeOne(hotbar.slot)) return 0;
    world.setBlock(x, y, z, id);
    return id;
  }
}
