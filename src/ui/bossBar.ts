/**
 * Boss health bar: a wide top-of-screen bar with the boss name and a draining
 * violet fill, shown only while a great boss is alive. Self-contained DOM +
 * injected CSS so it needs no stylesheet edits; reusable by every future boss.
 */
const STYLE_ID = 'boss-bar-style';
const CSS = `
#boss-bar {
  position: fixed;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  width: min(46vw, 560px);
  pointer-events: none;
  z-index: 26;
  text-align: center;
  opacity: 0;
  transition: opacity 400ms ease;
}
#boss-bar.show { opacity: 1; }
#boss-bar .boss-name {
  color: #e8ddff;
  font-size: 13px;
  letter-spacing: 3px;
  text-transform: uppercase;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 8px rgba(150, 96, 220, 0.6);
  margin-bottom: 4px;
}
#boss-bar .boss-track {
  height: 12px;
  border: 1px solid rgba(180, 140, 240, 0.55);
  border-radius: 7px;
  background: rgba(10, 8, 20, 0.72);
  overflow: hidden;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5);
}
#boss-bar .boss-fill {
  height: 100%;
  width: 100%;
  background: linear-gradient(90deg, #7a3fb0, #b060e0 60%, #d89bf0);
  box-shadow: 0 0 10px rgba(176, 96, 224, 0.7) inset;
  transition: width 200ms linear;
}`;

export class BossBar {
  private readonly root: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly nameEl: HTMLDivElement;
  private shown = false;
  private lastPct = -1;

  constructor(parent: HTMLElement) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.root = document.createElement('div');
    this.root.id = 'boss-bar';
    this.nameEl = document.createElement('div');
    this.nameEl.className = 'boss-name';
    const track = document.createElement('div');
    track.className = 'boss-track';
    this.fill = document.createElement('div');
    this.fill.className = 'boss-fill';
    track.appendChild(this.fill);
    this.root.append(this.nameEl, track);
    parent.appendChild(this.root);
  }

  /** Per-frame: show the bar for a live boss (fraction 0..1), hide otherwise. */
  update(active: boolean, name: string, fraction: number): void {
    if (!active) {
      if (this.shown) {
        this.shown = false;
        this.root.classList.remove('show');
      }
      return;
    }
    if (!this.shown) {
      this.shown = true;
      this.nameEl.textContent = name;
      this.root.classList.add('show');
    }
    const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
    if (pct !== this.lastPct) {
      this.lastPct = pct;
      this.fill.style.width = `${pct}%`;
    }
  }
}
