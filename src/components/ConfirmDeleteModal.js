export class ConfirmDeleteModal {
    #overlay;
    #label;
    #keydownHandler;
    #onClose = null;
    #mountTo = null;

    constructor({ mountTo } = {}) {
        this.#mountTo = mountTo || document.body;
        
        this.#overlay = document.createElement('div');
        this.#overlay.className = 'modal-overlay prayer-assignments-tab__delete-overlay';
        this.#overlay.style.display = 'none';
        this.#overlay.innerHTML = `
      <div class="modal prayer-assignments-tab__delete-modal">
        <h2>Delete record?</h2>
        <p class="prayer-assignments-tab__delete-label"></p>
        <div class="prayer-assignments-tab__delete-actions">
          <button type="button" class="btn btn--ghost" data-action="cancel">Cancel</button>
          <button type="button" class="btn btn--danger" data-action="confirm">Delete</button>
        </div>
      </div>
    `;
        this.#label = this.#overlay.querySelector('.prayer-assignments-tab__delete-label');

        this.#overlay.addEventListener('click', (event) => {
            if (event.target === this.#overlay) this.close();
        });
        this.#overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => this.close());
        this.#overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => this.close(true));

        this.#keydownHandler = (event) => {
            if (event.key === 'Escape') this.close();
        };
    }

    async open(label) {
        this.#mountTo.appendChild(this.#overlay);
        const res = await new Promise((resolve) => {
            this.#onClose = resolve;
            this.#label.textContent = label;
            this.#overlay.style.display = 'flex';
            document.addEventListener('keydown', this.#keydownHandler);
        });
        this.#onClose = null;
        this.#mountTo.removeChild(this.#overlay);
        return res;
    }

    close(result=false) {
        this.#overlay.style.display = 'none';
        this.#onClose?.(result);
        document.removeEventListener('keydown', this.#keydownHandler);
    }
}