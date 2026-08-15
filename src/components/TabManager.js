/**
 * Owns the fixed bottom tab bar and switching between registered tabs.
 * Deliberately generic — it knows nothing about "Appointments" specifically.
 *
 * Tab convention (not enforced via types, just a shared contract):
 *   class SomeTab {
 *     constructor(context) { ... builds this own root element ... }
 *     get element() { return this.#element; }
 *     async init() { ... one-time async setup, e.g. fetching data ... }  // optional
 *     onShow() { ... }   // optional — called every time it's re-activated
 *     onHide() { ... }   // optional — called every time it's deactivated
 *   }
 *
 * `context` is whatever shared dependencies every tab might need (API
 * client, repositories, auth gate, a shared Toast instance, etc.) — built
 * once by whoever owns the TabManager and handed to every tab's
 * constructor unchanged.
 *
 * Tabs are lazily instantiated on first activation and then kept alive
 * (just detached/reattached) so switching back to a tab preserves its
 * state instead of re-fetching and rebuilding from scratch every time.
 */
export class TabManager {
    #context;
    #contentContainer;
    #footerElement;
    #buttonsContainer;
    #tabs = [];
    #activeTabId = null;

    constructor({ context, contentContainer }) {
        this.#context = context;
        this.#contentContainer = contentContainer;
        this.#footerElement = this.#buildFooter();
    }

    get footerElement() {
        return this.#footerElement;
    }

    /** The first tab ever registered is activated automatically. */
    async registerTab({ id, label, TabClass }) {
        this.#tabs.push({ id, label, TabClass, instance: null, button: null });
        this.#renderFooterButtons();
    }

    async activateTab(id) {
        if (id === this.#activeTabId) return;
        const entry = this.#tabs.find((t) => t.id === id);
        if (!entry) return;

        const previous = this.#tabs.find((t) => t.id === this.#activeTabId);
        if (previous?.instance) {
            previous.instance.element.remove();
            previous.instance.onHide?.();
        }

        if (!entry.instance) {
            entry.instance = new entry.TabClass(this.#context);
            this.#contentContainer.appendChild(entry.instance.element);
            if (typeof entry.instance.init === 'function') {
                await entry.instance.init();
            }
        } else {
            this.#contentContainer.appendChild(entry.instance.element);
            entry.instance.onShow?.();
        }

        this.#activeTabId = id;
        window.location.hash = id;
        this.#updateFooterActiveState();
    }

    async start() {
        if (this.#tabs.length < 1) return;
        
        const hash = window.location.hash.slice(1);
        const entry = this.#tabs.find((t) => t.id === hash);
        if (entry)
            return this.activateTab(hash);
        else
            return this.activateTab(this.#tabs[0].id);
    }

    #buildFooter() {
        const footer = document.createElement('footer');
        footer.className = 'tab-footer';
        this.#buttonsContainer = document.createElement('div');
        this.#buttonsContainer.className = 'tab-footer__buttons';
        footer.appendChild(this.#buttonsContainer);
        return footer;
    }

    #renderFooterButtons() {
        this.#buttonsContainer.innerHTML = '';
        for (const tab of this.#tabs) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'tab-footer__button';
            button.textContent = tab.label;
            button.addEventListener('click', () => this.activateTab(tab.id));
            tab.button = button;
            this.#buttonsContainer.appendChild(button);
        }
        this.#updateFooterActiveState();
    }

    #updateFooterActiveState() {
        for (const tab of this.#tabs) {
            if (tab.button && tab.id === this.#activeTabId)
                tab.button.scrollIntoView({ behavior: 'smooth', inline: 'center' });
            tab.button?.classList.toggle('tab-footer__button--active', tab.id === this.#activeTabId);
        }
    }
}