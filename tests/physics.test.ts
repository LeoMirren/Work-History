import { describe, expect, it } from 'vitest';
import {
  createBody,
  GRAVITY,
  JUMP_VELOCITY,
  moveBody,
  type MoveResult,
  type SolidFn,
  TERMINAL_VELOCITY,
} from '../src/player/physics';

const DT = 1 / 60;

function newResult(): MoveResult {
  return { hitX: false, hitY: false, hitZ: false };
}

/** One §4.7 integration step: acceleration, then per-axis move. */
function gravityStep(solid: SolidFn, body: ReturnType<typeof createBody>, result: MoveResult): void {
  body.vy -= GRAVITY * DT;
  if (body.vy < -TERMINAL_VELOCITY) body.vy = -TERMINAL_VELOCITY;
  moveBody(solid, body, body.vx * DT, body.vy * DT, body.vz * DT, result);
}

describe('AABB physics', () => {
  it('lands exactly on block tops', () => {
    const solid: SolidFn = (_x, y, _z) => y <= 9; // ground surface at y=10
    const body = createBody(0.5, 14.25, 0.5);
    const result = newResult();
    for (let i = 0; i < 200 && !body.onGround; i++) gravityStep(solid, body, result);
    expect(body.onGround).toBe(true);
    expect(body.y).toBe(10);
    expect(body.vy).toBe(0);
  });

  it('keeps resting contact stable (no jitter or sinking)', () => {
    const solid: SolidFn = (_x, y, _z) => y <= 9;
    const body = createBody(0.5, 10, 0.5);
    const result = newResult();
    for (let i = 0; i < 120; i++) {
      gravityStep(solid, body, result);
      expect(body.y).toBe(10);
      expect(body.onGround).toBe(true);
    }
  });

  it('slides along walls preserving tangent motion', () => {
    // Wall: every block with x = 12 is solid below y 20.
    const solid: SolidFn = (x, y, _z) => x === 12 && y < 20;
    const body = createBody(11.5, 10, 0.5);
    body.vx = 3;
    body.vz = 3;
    const result = newResult();
    moveBody(solid, body, 1.0, 0, 1.0, result);
    expect(result.hitX).toBe(true);
    expect(result.hitZ).toBe(false);
    expect(body.x).toBe(12 - 0.3); // flush against the wall face
    expect(body.z).toBe(1.5); // tangent displacement fully preserved
    expect(body.vx).toBe(0);
    expect(body.vz).toBe(3); // tangent velocity untouched
  });

  it('never tunnels a 1-block floor at terminal velocity', () => {
    const solid: SolidFn = (_x, y, _z) => y === 9; // single-layer floor
    const body = createBody(0.5, 40, 0.5);
    body.vy = -TERMINAL_VELOCITY;
    const result = newResult();
    for (let i = 0; i < 240; i++) {
      moveBody(solid, body, 0, body.vy * DT, 0, result);
      expect(body.y).toBeGreaterThanOrEqual(10);
      if (body.onGround) break;
    }
    expect(body.onGround).toBe(true);
    expect(body.y).toBe(10);
  });

  it('jump apex is ~1.25 blocks', () => {
    const solid: SolidFn = (_x, y, _z) => y <= 9;
    const body = createBody(0.5, 10, 0.5);
    const result = newResult();
    gravityStep(solid, body, result); // settle onGround
    expect(body.onGround).toBe(true);
    body.vy = JUMP_VELOCITY;
    let apex = body.y;
    for (let i = 0; i < 200; i++) {
      gravityStep(solid, body, result);
      if (body.y > apex) apex = body.y;
      if (body.onGround) break;
    }
    expect(body.onGround).toBe(true);
    const height = apex - 10;
    expect(height).toBeGreaterThan(1.1);
    expect(height).toBeLessThan(1.35);
  });

  it('clamps into ceilings and zeroes upward velocity', () => {
    const solid: SolidFn = (_x, y, _z) => y <= 9 || y >= 13;
    const body = createBody(0.5, 10, 0.5);
    body.vy = JUMP_VELOCITY;
    const result = newResult();
    moveBody(solid, body, 0, body.vy * DT * 60, 0, result); // exaggerated upward move
    expect(result.hitY).toBe(true);
    expect(body.vy).toBe(0);
    expect(body.y).toBe(13 - 1.8); // head flush under the ceiling
    expect(body.onGround).toBe(false); // upward hit is not ground
  });
});
