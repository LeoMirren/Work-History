import { BUILD_TAG } from '../version';

/**
 * Title screen and pause menu (§4.9). Plain DOM; the game wires callbacks.
 */
export interface Settings {
  renderDistance: number;
  mouseSensitivity: number;
  fov: number;
}

export const DEFAULT_SETTINGS: Settings = {
  renderDistance: 10, // GPU-rendered chunks are cheap; streaming is the limit
  mouseSensitivity: 1.0,
  fov: 75,
};

export interface MenuCallbacks {
  onPlay(seed: string, survival: boolean): void;
  onResume(): void;
  onSave(): void;
  onNewWorld(seed: string): void;
  onSettingsChange(settings: Settings): void;
  /** Pause-menu button: flip the running world between creative/survival. */
  onModeToggle(): void;
}

function randomSeed(): string {
  return `world-${Math.random().toString(36).slice(2, 10)}`;
}

export class Menus {
  private readonly title: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private readonly titleSeedInput: HTMLInputElement;
  private readonly survivalCheckbox: HTMLInputElement;
  private readonly pauseSeedInput: HTMLInputElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly modeButton: HTMLButtonElement;
  private readonly sliders: { rd: HTMLInputElement; sens: HTMLInputElement; fov: HTMLInputElement };
  private readonly sliderLabels: { rd: HTMLElement; sens: HTMLElement; fov: HTMLElement };
  readonly settings: Settings = { ...DEFAULT_SETTINGS };

  constructor(parent: HTMLElement, private readonly callbacks: MenuCallbacks) {
    // --- Title screen ---
    this.title = document.createElement('div');
    this.title.className = 'menu-screen';
    const titlePanel = document.createElement('div');
    titlePanel.className = 'menu-panel';
    const h1 = document.createElement('h1');
    h1.textContent = 'Voxelheim';
    const tagline = document.createElement('p');
    tagline.className = 'tagline';
    tagline.textContent = 'an infinite procedural voxel sandbox';
    // The build stamp is the ground truth for stale-client debugging: if this
    // line doesn't match the latest tag, the browser is serving an old build.
    const build = document.createElement('p');
    build.className = 'controls-hint';
    build.textContent = BUILD_TAG;
    const seedRow = document.createElement('div');
    seedRow.className = 'menu-row';
    const seedLabel = document.createElement('label');
    seedLabel.textContent = 'Seed';
    this.titleSeedInput = document.createElement('input');
    this.titleSeedInput.type = 'text';
    this.titleSeedInput.value = randomSeed();
    seedRow.append(seedLabel, this.titleSeedInput);
    const modeRow = document.createElement('div');
    modeRow.className = 'menu-row checkbox-row';
    this.survivalCheckbox = document.createElement('input');
    this.survivalCheckbox.type = 'checkbox';
    this.survivalCheckbox.id = 'survival-mode';
    const modeLabel = document.createElement('label');
    modeLabel.htmlFor = 'survival-mode';
    modeLabel.textContent = 'Survival mode (HP, fall damage, timed breaking)';
    modeRow.append(this.survivalCheckbox, modeLabel);
    const playButton = document.createElement('button');
    playButton.textContent = 'Play';
    playButton.className = 'primary';
    playButton.addEventListener('click', () => {
      const seed = this.titleSeedInput.value.trim() || randomSeed();
      this.callbacks.onPlay(seed, this.survivalCheckbox.checked);
    });
    const controls = document.createElement('p');
    controls.className = 'controls-hint';
    controls.textContent =
      'WASD move · Arrow keys turn · Space jump · Ctrl sprint · F fly · LMB/RMB break · U use/place/talk · 1-9 hotbar · E inventory · Esc menu';
    titlePanel.append(h1, tagline, build, seedRow, modeRow, playButton, controls);
    this.title.appendChild(titlePanel);
    parent.appendChild(this.title);

    // --- Pause menu ---
    this.pause = document.createElement('div');
    this.pause.className = 'menu-screen hidden';
    const pausePanel = document.createElement('div');
    pausePanel.className = 'menu-panel';
    const h2 = document.createElement('h1');
    h2.textContent = 'Paused';

    const resume = document.createElement('button');
    resume.textContent = 'Resume';
    resume.className = 'primary';
    resume.addEventListener('click', () => this.callbacks.onResume());

    this.saveButton = document.createElement('button');
    this.saveButton.textContent = 'Save';
    this.saveButton.addEventListener('click', () => {
      this.callbacks.onSave();
      this.saveButton.textContent = 'Saved ✓';
      setTimeout(() => (this.saveButton.textContent = 'Save'), 1200);
    });

    this.modeButton = document.createElement('button');
    this.modeButton.textContent = 'Switch to survival mode';
    this.modeButton.addEventListener('click', () => this.callbacks.onModeToggle());

    const mkSlider = (
      label: string,
      min: number,
      max: number,
      step: number,
      value: number,
      format: (v: number) => string,
    ): { row: HTMLDivElement; input: HTMLInputElement; valueEl: HTMLElement } => {
      const row = document.createElement('div');
      row.className = 'menu-row';
      const lab = document.createElement('label');
      lab.textContent = label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(value);
      const valueEl = document.createElement('span');
      valueEl.className = 'slider-value';
      valueEl.textContent = format(value);
      row.append(lab, input, valueEl);
      return { row, input, valueEl };
    };

    const rd = mkSlider('Render distance', 4, 16, 1, this.settings.renderDistance, (v) => `${v}`);
    const sens = mkSlider('Mouse sensitivity', 0.2, 3, 0.1, this.settings.mouseSensitivity, (v) => v.toFixed(1));
    const fov = mkSlider('FOV', 60, 110, 1, this.settings.fov, (v) => `${v}°`);
    this.sliders = { rd: rd.input, sens: sens.input, fov: fov.input };
    this.sliderLabels = { rd: rd.valueEl, sens: sens.valueEl, fov: fov.valueEl };
    for (const key of ['rd', 'sens', 'fov'] as const) {
      this.sliders[key].addEventListener('input', () => this.emitSettings());
    }

    const newWorldRow = document.createElement('div');
    newWorldRow.className = 'menu-row';
    const newWorldLabel = document.createElement('label');
    newWorldLabel.textContent = 'Seed';
    this.pauseSeedInput = document.createElement('input');
    this.pauseSeedInput.type = 'text';
    newWorldRow.append(newWorldLabel, this.pauseSeedInput);
    const newWorld = document.createElement('button');
    newWorld.textContent = 'New World';
    newWorld.className = 'danger';
    newWorld.addEventListener('click', () => {
      const seed = this.pauseSeedInput.value.trim() || randomSeed();
      this.callbacks.onNewWorld(seed);
    });

    pausePanel.append(h2, resume, this.saveButton, this.modeButton, rd.row, sens.row, fov.row, newWorldRow, newWorld);
    this.pause.appendChild(pausePanel);
    parent.appendChild(this.pause);
  }

  private emitSettings(): void {
    this.settings.renderDistance = Number(this.sliders.rd.value);
    this.settings.mouseSensitivity = Number(this.sliders.sens.value);
    this.settings.fov = Number(this.sliders.fov.value);
    this.sliderLabels.rd.textContent = `${this.settings.renderDistance}`;
    this.sliderLabels.sens.textContent = this.settings.mouseSensitivity.toFixed(1);
    this.sliderLabels.fov.textContent = `${this.settings.fov}°`;
    this.callbacks.onSettingsChange({ ...this.settings });
  }

  /** Push externally loaded settings into the sliders (no callback echo). */
  applySettings(settings: Settings): void {
    this.settings.renderDistance = settings.renderDistance;
    this.settings.mouseSensitivity = settings.mouseSensitivity;
    this.settings.fov = settings.fov;
    this.sliders.rd.value = String(settings.renderDistance);
    this.sliders.sens.value = String(settings.mouseSensitivity);
    this.sliders.fov.value = String(settings.fov);
    this.sliderLabels.rd.textContent = `${settings.renderDistance}`;
    this.sliderLabels.sens.textContent = settings.mouseSensitivity.toFixed(1);
    this.sliderLabels.fov.textContent = `${settings.fov}°`;
  }

  setTitleSeed(seed: string): void {
    this.titleSeedInput.value = seed;
  }

  setTitleSurvival(survival: boolean): void {
    this.survivalCheckbox.checked = survival;
  }

  setPauseSeed(seed: string): void {
    this.pauseSeedInput.value = seed;
  }

  /** Reflect the running world's mode on the pause-menu toggle button. */
  setPauseMode(mode: 'creative' | 'survival'): void {
    this.modeButton.textContent = mode === 'survival' ? 'Switch to creative mode' : 'Switch to survival mode';
  }

  showTitle(): void {
    this.title.classList.remove('hidden');
  }

  hideTitle(): void {
    this.title.classList.add('hidden');
  }

  showPause(): void {
    this.pause.classList.remove('hidden');
  }

  hidePause(): void {
    this.pause.classList.add('hidden');
  }

  get pauseVisible(): boolean {
    return !this.pause.classList.contains('hidden');
  }
}
