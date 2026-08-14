import { AppointmentBlock } from './AppointmentBlock.js';

export class UnscheduledColumn {
  #appointments;
  #appointmentTypesById;
  #dragDropController;
  #dragCoordinator;
  #onAdd;
  #onAppointmentMove;
  #onAppointmentEdit;
  #element;
  #list;
  #countBadge;
  #isCollapsed = true; // starts collapsed so the mobile bottom sheet doesn't block the calendar on load

  constructor({
    appointments,
    appointmentTypesById,
    dragDropController,
    dragCoordinator,
    onAdd,
    onAppointmentMove,
    onAppointmentEdit,
  }) {
    this.#appointments = appointments;
    this.#appointmentTypesById = appointmentTypesById;
    this.#dragDropController = dragDropController;
    this.#dragCoordinator = dragCoordinator;
    this.#onAdd = onAdd;
    this.#onAppointmentMove = onAppointmentMove;
    this.#onAppointmentEdit = onAppointmentEdit;
    this.#element = this.#buildElement();
  }

  get element() {
    return this.#element;
  }

  #buildElement() {
    const col = document.createElement('div');
    col.className = 'day-column day-column--unscheduled';
    col.dataset.dropZone = 'unscheduled';
    col.classList.toggle('unscheduled-column--collapsed', this.#isCollapsed);

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'unscheduled-column__header';
    header.setAttribute('aria-expanded', String(!this.#isCollapsed));
    header.innerHTML = `
      <span class="unscheduled-column__title">Unscheduled</span>
      <span class="unscheduled-column__count">${this.#appointments.length}</span>
      <span class="unscheduled-column__chevron" aria-hidden="true">&#9650;</span>
    `;
    header.addEventListener('click', () => this.#toggleCollapsed(col, header));
    this.#countBadge = header.querySelector('.unscheduled-column__count');
    col.appendChild(header);

    const body = document.createElement('div');
    body.className = 'unscheduled-column__body';

    this.#list = document.createElement('div');
    this.#list.className = 'unscheduled-column__list';
    this.#renderBlocks();
    body.appendChild(this.#list);

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'btn btn--ghost unscheduled-column__add';
    addButton.textContent = '+ Add';
    addButton.addEventListener('click', () => this.#onAdd());
    body.appendChild(addButton);

    col.appendChild(body);

    this.#dragCoordinator.registerZone('unscheduled', {
      element: col,
      trackElement: this.#list,
      isUnscheduled: true,
    });

    return col;
  }

  #toggleCollapsed(col, header) {
    this.#isCollapsed = !this.#isCollapsed;
    col.classList.toggle('unscheduled-column--collapsed', this.#isCollapsed);
    header.setAttribute('aria-expanded', String(!this.#isCollapsed));
  }

  #renderBlocks() {
    this.#list.innerHTML = '';
    if (this.#appointments.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'unscheduled-column__empty';
      empty.textContent = 'Nothing waiting to be scheduled.';
      this.#list.appendChild(empty);
      return;
    }
    for (const appointment of this.#appointments) {
      const block = new AppointmentBlock({
        appointment,
        appointmentType: this.#appointmentTypesById.get(appointment.appointmentTypeId),
        isOutsideAvailability: false,
        layout: 'static',
        homeKey: 'unscheduled',
        dragDropController: this.#dragDropController,
        dragCoordinator: this.#dragCoordinator,
        onMove: this.#onAppointmentMove,
        onEdit: this.#onAppointmentEdit,
      });
      this.#list.appendChild(block.element);
    }
  }
}