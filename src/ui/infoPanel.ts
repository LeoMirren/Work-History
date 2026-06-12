/**
 * Side info panel (Tab): controls reference plus live status — health, mode,
 * position, time of day and nearby wildlife. DOM-only; main feeds status at
 * the debug cadence.
 */
import { CONTROLS } from './controls';

export interface PanelStatus {
  hp: number;
  maxHp: number;
  hunger: number;
  mode: string;
  position: string;
  time: string;
  animals: number;
  fps: number;
}

export class InfoPanel {
  private readonly root: HTMLDivElement;
  private readonly statusValues = new Map<string, HTMLSpanElement>();
  visible = true;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'info-panel';

    const status = document.createElement('div');
    status.className = 'panel-section';
    const statusTitle = document.createElement('h2');
    statusTitle.textContent = 'Status';
    status.appendChild(statusTitle);
    for (const key of ['Health', 'Hunger', 'Mode', 'Position', 'Time', 'Wildlife', 'FPS'] as const) {
      const row = document.createElement('div');
      row.className = 'panel-row';
      const label = document.createElement('span');
      label.className = 'panel-label';
      label.textContent = key;
      const value = document.createElement('span');
      value.className = 'panel-value';
      value.textContent = '—';
      row.append(label, value);
      status.appendChild(row);
      this.statusValues.set(key, value);
    }

    const controls = document.createElement('div');
    controls.className = 'panel-section';
    const controlsTitle = document.createElement('h2');
    controlsTitle.textContent = 'Controls';
    controls.appendChild(controlsTitle);
    for (const [keys, action] of CONTROLS) {
      const row = document.createElement('div');
      row.className = 'panel-row';
      const k = document.createElement('span');
      k.className = 'panel-label key';
      k.textContent = keys;
      const a = document.createElement('span');
      a.className = 'panel-value';
      a.textContent = action;
      row.append(k, a);
      controls.appendChild(row);
    }

    this.root.append(status, controls);
    this.root.style.display = 'none';
    parent.appendChild(this.root);
  }

  show(): void {
    this.visible = true;
    this.root.style.display = 'block';
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.style.display = this.visible ? 'block' : 'none';
  }

  setStatus(s: PanelStatus): void {
    if (!this.visible) return;
    this.statusValues.get('Health')?.replaceChildren(`${'♥'.repeat(Math.ceil(s.hp / 2))} ${s.hp}/${s.maxHp}`);
    this.statusValues.get('Hunger')?.replaceChildren(`${'◆'.repeat(Math.ceil(s.hunger / 2))} ${s.hunger}/20`);
    this.statusValues.get('Mode')?.replaceChildren(s.mode);
    this.statusValues.get('Position')?.replaceChildren(s.position);
    this.statusValues.get('Time')?.replaceChildren(s.time);
    this.statusValues.get('Wildlife')?.replaceChildren(`${s.animals} nearby`);
    this.statusValues.get('FPS')?.replaceChildren(String(s.fps));
  }
}
