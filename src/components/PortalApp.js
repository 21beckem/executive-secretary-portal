import { Toast } from './Toast.js';
import { TabManager } from './TabManager.js';
import { AppointmentsTab } from './tabs/AppointmentsTab.js';
import { PrayerAssignmentsTab } from './tabs/PrayerAssignmentsTab.js';
import { BriefsTab } from './tabs/BriefsTab.js';

export class PortalApp {
  #rootElement;
  #context;
  #tabManager;

  constructor({
    apiClient,
    authGate,
    appointmentRepository,
    appointmentTypeRepository,
    availabilityRepository,
    rootElement,
  }) {
    this.#rootElement = rootElement;
    // Shared across every tab — a shared Toast means tabs don't each spin up
    // their own toast-container (which would stack multiple fixed elements).
    const toast = new Toast();
    this.#context = {
      apiClient,
      authGate,
      toast,
      appointmentRepository,
      appointmentTypeRepository,
      availabilityRepository,
    };
  }

  async init() {
    this.#rootElement.innerHTML = '';

    const header = document.createElement('header');
    header.className = 'app-header';
    header.innerHTML = `<h1>Executive Secretary Portal</h1>`;

    const content = document.createElement('div');
    content.className = 'portal-content';

    this.#tabManager = new TabManager({ context: this.#context, contentContainer: content });

    this.#rootElement.appendChild(header);
    this.#rootElement.appendChild(content);
    this.#rootElement.appendChild(this.#tabManager.footerElement);

    // for back-button on mobile detection
    window.history.pushState(null, null, window.location.href);
    window.addEventListener('popstate', function (event) {
        window.history.pushState(null, null, window.location.href);
        document.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                which: 27,
                bubbles: true,
                cancelable: true
            })
        );
    });

    await Promise.all([
        this.#tabManager.registerTab({ id: 'appointments', label: 'Appointments', TabClass: AppointmentsTab }),
        this.#tabManager.registerTab({ id: 'prayers', label: 'Prayers', TabClass: PrayerAssignmentsTab }),
        this.#tabManager.registerTab({ id: 'briefs', label: 'Briefs', TabClass: BriefsTab }),
    ]);

    await this.#tabManager.start();
  }
}