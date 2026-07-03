/**
 * Goal toast: a glass + amber banner that slides in top-centre when a
 * progression goal completes ("Goal complete — <title>"), lingers ~3.5 s,
 * then slides away. Announcements queue so back-to-back goals each get
 * their moment. Self-contained — styles ship in an injected <style> tag
 * (with fallbacks for the theme variables defined in style.css).
 */

const STYLE_ID = 'goal-toast-style';
const SHOW_MS = 3500;
const FADE_MS = 320;

const CSS = `
.goal-toast {
  position: fixed;
  top: 18px;
  left: 50%;
  transform: translate(-50%, -14px);
  padding: 8px 22px;
  text-align: center;
  background: linear-gradient(180deg, var(--glass-hi, rgba(17, 22, 42, 0.8)), var(--glass-lo, rgba(7, 9, 19, 0.88)));
  border: 1px solid var(--amber-line, rgba(255, 184, 77, 0.32));
  border-radius: 999px;
  white-space: nowrap;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  pointer-events: none;
  opacity: 0;
  transition: opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease;
  z-index: 40;
}
.goal-toast.show {
  opacity: 1;
  transform: translate(-50%, 0);
}
.goal-toast-title {
  color: var(--amber-bright, #ffd98f);
  font-size: 13px;
  letter-spacing: 0.4px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
.goal-toast-text {
  margin-top: 2px;
  color: var(--ink-dim, rgba(233, 238, 251, 0.62));
  font-size: 11.5px;
  letter-spacing: 0.3px;
}
`;

/** Inject the toast stylesheet once per document. */
function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** Queued banner announcing completed goals, one at a time. */
export class GoalToast {
  private readonly el: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly textEl: HTMLDivElement;
  private readonly queue: { title: string; text: string }[] = [];
  private busy = false;

  constructor(parent: HTMLElement) {
    ensureStyles();
    this.el = document.createElement('div');
    this.el.className = 'goal-toast';
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'goal-toast-title';
    this.textEl = document.createElement('div');
    this.textEl.className = 'goal-toast-text';
    this.el.append(this.titleEl, this.textEl);
    parent.appendChild(this.el);
  }

  /** Announce a completed goal; queues if a banner is already showing. */
  show(title: string, text: string): void {
    this.queue.push({ title, text });
    if (!this.busy) this.next();
  }

  /** Pop and display the next queued announcement, if any. */
  private next(): void {
    const item = this.queue.shift();
    if (!item) {
      this.busy = false;
      return;
    }
    this.busy = true;
    this.titleEl.textContent = `Goal complete — ${item.title}`;
    this.textEl.textContent = item.text;
    // Force a reflow so re-adding .show restarts the slide-in transition.
    void this.el.offsetHeight;
    this.el.classList.add('show');
    window.setTimeout(() => {
      this.el.classList.remove('show');
      window.setTimeout(() => this.next(), FADE_MS);
    }, SHOW_MS);
  }
}
