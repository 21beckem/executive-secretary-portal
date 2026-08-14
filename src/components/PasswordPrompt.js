export class PasswordPrompt {
  #onSubmit;
  #element;

  constructor({ onSubmit, errorMessage = null }) {
    this.#onSubmit = onSubmit;
    this.#element = this.#build(errorMessage);
  }

  mount(container) {
    container.appendChild(this.#element);
    this.#element.querySelector('input').focus();
  }

  unmount() {
    this.#element.remove();
  }

  #build(errorMessage) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal password-prompt">
        <h2>Executive Secretary Portal</h2>
        <p>Enter the app password to continue.</p>
        <p class="form-error" ${errorMessage ? '' : 'hidden'}>${errorMessage ?? ''}</p>
        <form class="password-prompt__form">
          <input type="password" name="password" autocomplete="current-password" required />
          <button type="submit" class="btn btn--primary">Unlock</button>
        </form>
      </div>
    `;

    overlay.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const value = new FormData(e.target).get('password');
      if (value) this.#onSubmit(String(value));
    });

    return overlay;
  }
}
