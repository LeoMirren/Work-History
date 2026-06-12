/**
 * Damage feedback intensity (pure, DOM-free so it's unit-testable). Combines
 * a decaying red flash on each hit with a steady low-health vignette.
 */
export const LOW_HP_THRESHOLD = 6;
const FLASH_DECAY_PER_S = 2.2;
const MAX_OVERLAY = 0.85;

export class HurtIndicator {
  /** Current flash level 0..1, spiked by hit() and decayed by update(). */
  flash = 0;

  /** Register damage; bigger hits flash harder. */
  hit(amount: number): void {
    this.flash = Math.min(1, this.flash + Math.min(1, amount / 8 + 0.3));
  }

  /** Decay the flash; call once per frame. */
  update(dt: number): void {
    this.flash = Math.max(0, this.flash - dt * FLASH_DECAY_PER_S);
  }

  /** Overlay opacity 0..MAX given current hp: flash plus a low-hp vignette. */
  intensity(hp: number, maxHp: number): number {
    void maxHp;
    const lowHp = hp <= LOW_HP_THRESHOLD ? ((LOW_HP_THRESHOLD - hp) / LOW_HP_THRESHOLD) * 0.35 : 0;
    return Math.min(MAX_OVERLAY, this.flash * 0.6 + lowHp);
  }
}
