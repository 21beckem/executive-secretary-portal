export class Toast {
  #container;

  constructor() {
    this.#container = document.createElement('div');
    this.#container.className = 'toast-container';
    document.body.appendChild(this.#container);
  }

  show(message, { type = 'info', durationMs = 4000 } = {}) {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    this.#container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('toast--visible'));
    setTimeout(() => {
      toast.classList.remove('toast--visible');
      setTimeout(() => toast.remove(), 200);
    }, durationMs);
  }
}
