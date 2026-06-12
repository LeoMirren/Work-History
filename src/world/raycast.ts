/**
 * Amanatides–Woo voxel DDA traversal (§4.8). Pure: world access is a block
 * query function, the result lands in a caller-owned out object (no per-call
 * allocation — this runs every frame).
 *
 * The starting voxel is never reported: you can't meaningfully break or place
 * against the cell your eye occupies.
 */
export interface RaycastHit {
  bx: number;
  by: number;
  bz: number;
  nx: number;
  ny: number;
  nz: number;
  distance: number;
}

export type BlockQuery = (x: number, y: number, z: number) => number;

export function raycast(
  getBlock: BlockQuery,
  isTargetable: (id: number) => boolean,
  ox: number,
  oy: number,
  oz: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  maxDistance: number,
  out: RaycastHit,
): boolean {
  const len = Math.hypot(dirX, dirY, dirZ);
  if (len === 0) return false;
  const dx = dirX / len;
  const dy = dirY / len;
  const dz = dirZ / len;

  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

  let tMaxX = stepX > 0 ? (x + 1 - ox) / dx : stepX < 0 ? (x - ox) / dx : Infinity;
  let tMaxY = stepY > 0 ? (y + 1 - oy) / dy : stepY < 0 ? (y - oy) / dy : Infinity;
  let tMaxZ = stepZ > 0 ? (z + 1 - oz) / dz : stepZ < 0 ? (z - oz) / dz : Infinity;

  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;

  for (;;) {
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let t: number;
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      t = tMaxX;
      if (t > maxDistance) return false;
      x += stepX;
      tMaxX += tDeltaX;
      nx = -stepX;
    } else if (tMaxY <= tMaxZ) {
      t = tMaxY;
      if (t > maxDistance) return false;
      y += stepY;
      tMaxY += tDeltaY;
      ny = -stepY;
    } else {
      t = tMaxZ;
      if (t > maxDistance) return false;
      z += stepZ;
      tMaxZ += tDeltaZ;
      nz = -stepZ;
    }
    if (isTargetable(getBlock(x, y, z))) {
      out.bx = x;
      out.by = y;
      out.bz = z;
      out.nx = nx;
      out.ny = ny;
      out.nz = nz;
      out.distance = t;
      return true;
    }
  }
}
