/**
 * Red damage vignette. A fixed full-screen element whose opacity is driven by
 * the pure HurtIndicator; DOM writes are skipped when the value is unchanged.
 */
export class DamageOverlay {
  private readonly el: HTMLDivElement;
  private last = -1;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'damage-overlay';
    parent.appendChild(this.el);
  }

  /** opacity 0..1; only touches the DOM on a meaningful change. */
  setIntensity(value: number): void {
    const v = Math.round(value * 100) / 100;
    if (v === this.last) return;
    this.last = v;
    this.el.style.opacity = String(v);
  }
}
