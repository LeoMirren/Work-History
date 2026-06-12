/**
 * AABB integration & resolution against the voxel grid (§4.7). Pure: the
 * world is abstracted as a solid-test function, so every behavior is
 * unit-testable without DOM or chunks.
 *
 * Axis order per spec: X, then Y (sets onGround), then Z. Each axis moves in
 * substeps < 0.5 so even terminal velocity cannot tunnel a 1-block wall.
 * Resolution is flush (exact face contact) with strict-inequality overlap,
 * which keeps resting contact stable; EPSILON only guards the sweep loop's
 * termination.
 */
export const PLAYER_HALF_WIDTH = 0.3;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;
export const GRAVITY = 32;
export const JUMP_VELOCITY = 9;
export const TERMINAL_VELOCITY = 60;
export const WALK_SPEED = 4.3;
export const SPRINT_SPEED = 5.6;
export const SNEAK_SPEED = 1.5;
export const FLY_SPEED = 10.8;
export const WATER_GRAVITY = 4;
export const WATER_MAX_VERTICAL = 3;
export const WATER_SWIM_UP = 4;
export const WATER_HORIZONTAL_FACTOR = 0.5;

export const EPSILON = 0.001;
const MAX_SUBSTEP = 0.45; // < 0.5 per spec: no tunneling per axis step
const MIN_SWEEP = 1e-7; // ignore sub-float-noise residual motion

export type SolidFn = (x: number, y: number, z: number) => boolean;

/** Player body; (x,y,z) is the feet-center of the AABB. */
export interface Body {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  onGround: boolean;
}

export function createBody(x: number, y: number, z: number): Body {
  return { x, y, z, vx: 0, vy: 0, vz: 0, onGround: false };
}

export interface MoveResult {
  hitX: boolean;
  hitY: boolean;
  hitZ: boolean;
}

// Reused box to keep the per-step hot path allocation-free.
const box = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };

function syncBoxFromBody(body: Body): void {
  box.minX = body.x - PLAYER_HALF_WIDTH;
  box.maxX = body.x + PLAYER_HALF_WIDTH;
  box.minY = body.y;
  box.maxY = body.y + PLAYER_HEIGHT;
  box.minZ = body.z - PLAYER_HALF_WIDTH;
  box.maxZ = body.z + PLAYER_HALF_WIDTH;
}

/** Any solid block overlapping the (strictly) open box volume? */
function boxOverlapsSolid(solid: SolidFn): boolean {
  const x0 = Math.floor(box.minX);
  const x1 = Math.ceil(box.maxX) - 1;
  const y0 = Math.floor(box.minY);
  const y1 = Math.ceil(box.maxY) - 1;
  const z0 = Math.floor(box.minZ);
  const z1 = Math.ceil(box.maxZ) - 1;
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (solid(x, y, z)) return true;
      }
    }
  }
  return false;
}

/** Sweep the box along one axis, clamping flush on hit. Returns hit. */
function sweepAxis(solid: SolidFn, axis: 0 | 1 | 2, dist: number): boolean {
  if (dist === 0) return false;
  let remaining = dist;
  const sign = dist > 0 ? 1 : -1;
  while (sign * remaining > MIN_SWEEP) {
    const step = sign * Math.min(sign * remaining, MAX_SUBSTEP);
    remaining -= step;
    if (axis === 0) {
      box.minX += step;
      box.maxX += step;
    } else if (axis === 1) {
      box.minY += step;
      box.maxY += step;
    } else {
      box.minZ += step;
      box.maxZ += step;
    }
    if (boxOverlapsSolid(solid)) {
      if (axis === 0) {
        const correction = sign > 0 ? box.maxX - Math.floor(box.maxX) : box.minX - Math.floor(box.minX) - 1;
        box.minX -= correction;
        box.maxX -= correction;
      } else if (axis === 1) {
        const correction = sign > 0 ? box.maxY - Math.floor(box.maxY) : box.minY - Math.floor(box.minY) - 1;
        box.minY -= correction;
        box.maxY -= correction;
      } else {
        const correction = sign > 0 ? box.maxZ - Math.floor(box.maxZ) : box.minZ - Math.floor(box.minZ) - 1;
        box.minZ -= correction;
        box.maxZ -= correction;
      }
      return true;
    }
  }
  return false;
}

/**
 * Move the body by (dx, dy, dz) with per-axis resolution. Velocities are
 * zeroed on the axes that hit; onGround is set iff the Y move hit downward.
 */
export function moveBody(solid: SolidFn, body: Body, dx: number, dy: number, dz: number, result: MoveResult): void {
  syncBoxFromBody(body);
  result.hitX = sweepAxis(solid, 0, dx);
  result.hitY = sweepAxis(solid, 1, dy);
  result.hitZ = sweepAxis(solid, 2, dz);
  body.x = (box.minX + box.maxX) / 2;
  body.y = box.minY;
  body.z = (box.minZ + box.maxZ) / 2;
  if (result.hitX) body.vx = 0;
  if (result.hitY) body.vy = 0;
  if (result.hitZ) body.vz = 0;
  body.onGround = result.hitY && dy < 0;
}

/** Does the unit block cell at (bx,by,bz) intersect the body's AABB? (§4.8) */
export function blockIntersectsBody(bx: number, by: number, bz: number, body: Body): boolean {
  return (
    bx + 1 > body.x - PLAYER_HALF_WIDTH &&
    bx < body.x + PLAYER_HALF_WIDTH &&
    by + 1 > body.y &&
    by < body.y + PLAYER_HEIGHT &&
    bz + 1 > body.z - PLAYER_HALF_WIDTH &&
    bz < body.z + PLAYER_HALF_WIDTH
  );
}
