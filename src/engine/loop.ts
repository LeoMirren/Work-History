/**
 * Fixed-step game loop: physics updates at a constant 60Hz regardless of
 * display refresh, render runs every animation frame. `alpha` is the fraction
 * of a physics step left in the accumulator, for render interpolation.
 */
export interface LoopHooks {
  update(dt: number): void;
  render(alpha: number, frameDt: number): void;
}

export const FIXED_STEP = 1 / 60;

const MAX_STEPS_PER_FRAME = 5;

export function startLoop(hooks: LoopHooks): void {
  let last = performance.now();
  let accumulator = 0;
  const frame = (now: number): void => {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25; // tab was backgrounded; don't replay the gap
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
      hooks.update(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0; // avoid death spiral
    hooks.render(accumulator / FIXED_STEP, dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
