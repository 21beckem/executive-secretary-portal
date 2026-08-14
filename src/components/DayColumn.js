import { DateUtils } from '../utils/DateUtils.js';
import { AppointmentBlock } from './AppointmentBlock.js';

export class DayColumn {
  #date;
  #iso;
  #windows;
  #appointments;
  #appointmentTypesById;
  #availabilityCalculator;
  #gridStartMinutes;
  #gridEndMinutes;
  #dragDropController;
  #dragCoordinator;
  #isRegularDay;
  #isToday;
  #onSlotClick;
  #onAppointmentMove;
  #onAppointmentEdit;
  #element;
  #track;

  constructor({
    date,
    iso,
    windows,
    appointments,
    appointmentTypesById,
    availabilityCalculator,
    gridStartMinutes,
    gridEndMinutes,
    dragDropController,
    dragCoordinator,
    isRegularDay,
    isToday,
    onSlotClick,
    onAppointmentMove,
    onAppointmentEdit,
  }) {
    this.#date = date;
    this.#iso = iso;
    this.#windows = windows;
    this.#appointments = appointments;
    this.#appointmentTypesById = appointmentTypesById;
    this.#availabilityCalculator = availabilityCalculator;
    this.#gridStartMinutes = gridStartMinutes;
    this.#gridEndMinutes = gridEndMinutes;
    this.#dragDropController = dragDropController;
    this.#dragCoordinator = dragCoordinator;
    this.#isRegularDay = isRegularDay;
    this.#isToday = isToday;
    this.#onSlotClick = onSlotClick;
    this.#onAppointmentMove = onAppointmentMove;
    this.#onAppointmentEdit = onAppointmentEdit;
    this.#element = this.#buildElement();
  }

  get element() {
    return this.#element;
  }

  get iso() {
    return this.#iso;
  }

  #buildElement() {
    const col = document.createElement('div');
    col.className = 'day-column';
    col.dataset.dropZone = 'day';
    if (this.#isToday) col.classList.add('day-column--today');
    if (!this.#isRegularDay) col.classList.add('day-column--exception');

    const header = document.createElement('div');
    header.className = 'day-column__header';
    header.innerHTML = `
      <div class="day-column__heading">${DateUtils.formatDateHeading(this.#date)}</div>
      ${!this.#isRegularDay ? '<div class="day-column__badge">Not a usual day</div>' : ''}
    `;
    col.appendChild(header);

    const totalMinutes = this.#gridEndMinutes - this.#gridStartMinutes;
    this.#track = document.createElement('div');
    this.#track.className = 'day-column__track';
    this.#track.style.height = `${this.#dragDropController.minutesToPixels(totalMinutes)}px`;
    this.#track.style.setProperty('--px-per-quarter-hour', `${this.#dragDropController.minutesToPixels(15)}px`);

    this.#renderAvailabilityShading();
    this.#track.addEventListener('click', this.#handleTrackClick);
    this.#renderAppointments();
    this.#renderHourLabels();

    col.appendChild(this.#track);

    this.#dragCoordinator.registerZone(this.#iso, {
      element: col,
      trackElement: this.#track,
      gridStartMinutes: this.#gridStartMinutes,
      gridEndMinutes: this.#gridEndMinutes,
      isUnscheduled: false,
    });

    return col;
  }

  #renderAvailabilityShading() {
    for (const w of this.#windows) {
      const shade = document.createElement('div');
      shade.className = 'availability-window';
      const startMin = DateUtils.timeToMinutes(w.startTime);
      const endMin = DateUtils.timeToMinutes(w.endTime);
      shade.style.top = `${this.#dragDropController.minutesToPixels(startMin - this.#gridStartMinutes)}px`;
      shade.style.height = `${this.#dragDropController.minutesToPixels(endMin - startMin)}px`;
      this.#track.appendChild(shade);
    }
  }

  #renderAppointments() {
    for (const appointment of this.#appointments) {
      const block = new AppointmentBlock({
        appointment,
        appointmentType: this.#appointmentTypesById.get(appointment.appointmentTypeId),
        isOutsideAvailability: !this.#availabilityCalculator.isWithinAvailability(appointment),
        layout: 'timed',
        homeKey: this.#iso,
        gridStartMinutes: this.#gridStartMinutes,
        gridEndMinutes: this.#gridEndMinutes,
        dragDropController: this.#dragDropController,
        dragCoordinator: this.#dragCoordinator,
        onMove: this.#onAppointmentMove,
        onEdit: this.#onAppointmentEdit,
      });
      this.#track.appendChild(block.element);
    }
  }

  /**
   * Hour marks, right-aligned inside the column, sitting above the
   * appointment blocks but click-through (pointer-events: none) so slot
   * creation still works underneath them.
   */
  #renderHourLabels() {
    const overlay = document.createElement('div');
    overlay.className = 'day-column__hour-labels';
    const firstHourMark = Math.ceil(this.#gridStartMinutes / 60) * 60;
    for (let m = firstHourMark; m <= this.#gridEndMinutes; m += 60) {
      const label = document.createElement('div');
      label.className = 'day-column__hour-label';
      label.style.top = `${this.#dragDropController.minutesToPixels(m - this.#gridStartMinutes)}px`;
      label.textContent = DateUtils.formatTimeDisplay(DateUtils.minutesToTime(m));
      overlay.appendChild(label);
    }
    this.#track.appendChild(overlay);
  }

  // Availability shading and hour labels both have pointer-events: none
  // (see CSS), so clicks pass through them to the track; clicks on an
  // appointment block never reach here since the block owns its own element.
  #handleTrackClick = (e) => {
    if (e.target !== this.#track) return;
    const rect = this.#track.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const rawMinutes = this.#gridStartMinutes + this.#dragDropController.pixelsToMinutes(offsetY);
    const snapped = DateUtils.snapToQuarterHour(rawMinutes);
    this.#onSlotClick(this.#iso, DateUtils.minutesToTime(snapped));
  };
}
