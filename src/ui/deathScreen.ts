/**
 * Death screen: a blocking overlay shown when the player dies, with a single
 * Respawn action. Plain DOM, reuses the menu-screen styling.
 */
export class DeathScreen {
  visible = false;
  private readonly root: HTMLDivElement;

  constructor(parent: HTMLElement, private readonly onRespawn: () => void) {
    this.root = document.createElement('div');
    this.root.id = 'death-screen';
    this.root.className = 'menu-screen hidden';
    const panel = document.createElement('div');
    panel.className = 'menu-panel death-panel';
    const h1 = document.createElement('h1');
    h1.textContent = 'You fell…';
    const sub = document.createElement('p');
    sub.className = 'tagline';
    sub.textContent = 'The world goes on without you.';
    const button = document.createElement('button');
    button.className = 'primary';
    button.textContent = 'Respawn';
    button.addEventListener('click', () => this.onRespawn());
    panel.append(h1, sub, button);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
  }

  show(): void {
    this.visible = true;
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.visible = false;
    this.root.classList.add('hidden');
  }
}
