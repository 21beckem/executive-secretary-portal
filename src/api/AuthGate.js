import { PasswordPrompt } from '../components/PasswordPrompt.js';

const STORAGE_KEY = 'bishop_scheduler_password';

/**
 * Single source of truth for "do we have a password, and what is it".
 * Deliberately uses sessionStorage (not localStorage) so a forgotten,
 * shared, or public computer doesn't stay signed in indefinitely.
 */
export class AuthGate {
  #password;

  constructor() {
    this.#password = sessionStorage.getItem(STORAGE_KEY);
  }

  get password() {
    return this.#password;
  }

  isAuthenticated() {
    return Boolean(this.#password);
  }

  /** Resolves with the password once one is available, prompting if needed. */
  async ensureAuthenticated(container) {
    if (this.isAuthenticated()) return this.#password;
    return this.#promptForPassword(container);
  }

  /** Call this when the API reports 401 mid-session (e.g. password was wrong / changed). */
  async reset(container, errorMessage = 'Incorrect password. Try again.') {
    this.#password = null;
    sessionStorage.removeItem(STORAGE_KEY);
    return this.#promptForPassword(container, errorMessage);
  }

  #promptForPassword(container, errorMessage = null) {
    return new Promise((resolve) => {
      const prompt = new PasswordPrompt({
        errorMessage,
        onSubmit: (value) => {
          this.#password = value;
          sessionStorage.setItem(STORAGE_KEY, value);
          prompt.unmount();
          resolve(value);
        },
      });
      prompt.mount(container);
    });
  }
}
