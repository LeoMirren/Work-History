/**
 * Keyboard/mouse state and pointer lock. Continuous state (isDown) is polled
 * by physics; edge events (takePressed, clicks, wheel) are drained exactly
 * once by whoever consumes them.
 */
export class Input {
  private readonly keysDown = new Set<string>();
  private readonly pressedQueue = new Set<string>();
  private readonly clickQueue: number[] = [];
  private readonly buttonsDown = new Set<number>();
  private mouseDX = 0;
  private mouseDY = 0;
  private wheelAcc = 0;
  locked = false;
  onLockChange: ((locked: boolean) => void) | null = null;

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      // Keep browser shortcuts out of game keys (F3 search, Tab focus-walk).
      if (e.code === 'F3' || (e.code === 'Tab' && this.locked)) e.preventDefault();
      if (!e.repeat) {
        this.pressedQueue.add(e.code);
        // Trackpad-friendly mouse aliases: R taps as a right-click (use /
        // place), C taps as a left-click (attack) and, held, mines — see
        // isButtonDown. Only while pointer-locked, like real clicks.
        if (this.locked && e.code === 'KeyR') this.clickQueue.push(2);
        if (this.locked && e.code === 'KeyC') this.clickQueue.push(0);
      }
      this.keysDown.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keysDown.delete(e.code));
    window.addEventListener('blur', () => this.keysDown.clear());
    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    document.addEventListener('mousedown', (e) => {
      if (this.locked) {
        this.clickQueue.push(e.button);
        this.buttonsDown.add(e.button);
      }
    });
    document.addEventListener('mouseup', (e) => this.buttonsDown.delete(e.button));
    document.addEventListener(
      'wheel',
      (e) => {
        if (this.locked) this.wheelAcc += e.deltaY;
      },
      { passive: true },
    );
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.clearTransient();
      this.onLockChange?.(this.locked);
    });
  }

  requestLock(): void {
    if (!this.locked) {
      // The promise rejects if the user just pressed Esc; that's fine.
      void Promise.resolve(this.element.requestPointerLock()).catch(() => undefined);
    }
  }

  isDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  /** Mouse button currently held (0=left, 2=right). Holding C mines like LMB. */
  isButtonDown(button: number): boolean {
    if (button === 0 && this.locked && this.keysDown.has('KeyC')) return true;
    return this.buttonsDown.has(button);
  }

  /** True exactly once per physical key press. */
  takePressed(code: string): boolean {
    return this.pressedQueue.delete(code);
  }

  /** Drain accumulated mouse movement into out.{dx,dy}. */
  takeMouseDelta(out: { dx: number; dy: number }): void {
    out.dx = this.mouseDX;
    out.dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  takeWheel(): number {
    const w = this.wheelAcc;
    this.wheelAcc = 0;
    return w;
  }

  /** Drain queued mouse-button presses (0=left, 2=right). */
  takeClicks(out: number[]): void {
    out.length = 0;
    for (const b of this.clickQueue) out.push(b);
    this.clickQueue.length = 0;
  }

  clearTransient(): void {
    this.pressedQueue.clear();
    this.clickQueue.length = 0;
    this.buttonsDown.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelAcc = 0;
  }
}
