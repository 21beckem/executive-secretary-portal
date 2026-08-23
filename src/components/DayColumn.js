import { DateUtils } from '../utils/DateUtils.js';
import { copyToClipboard } from '../utils/helpers.js';
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
  #onStatusChange;
  #element;
  #track;
  #onShowToast;

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
    onStatusChange,
    onShowToast,
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
    this.#onStatusChange = onStatusChange;
    this.#onShowToast = onShowToast;
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
      <button class="day-column__export-button" type="button" aria-label="Export" title="Export">➜]</button>
    `;
    header.querySelector('.day-column__export-button').addEventListener('click', () => {
      // format appointments into a text message and copy to clipboard
      const appointmentsText = this.#appointments.map(a => {
        const startTime = DateUtils.formatTimeDisplay(a.startTime);
        const name = a.personName ?? '';
        const typeName = this.#appointmentTypesById.get(a.appointmentTypeId)?.name ?? 'Other';
        return `${startTime}: ${name}${typeName.toLowerCase() === 'other' ? '' : ` (${typeName})`}`;
      }).join('\n');

      const relativeLabel = DateUtils.formatRelativeLabel( this.#date, new Date(), false );
      const fullText = `Hi Bishop, here are your appointments for ${relativeLabel}:\n${appointmentsText}`;

      copyToClipboard(fullText).then(() => {
        this.#onShowToast(`Copied ${this.#appointments.length} appointments to clipboard.`, 'success');
      }).catch((err) => {
        console.error('Failed to copy appointments to clipboard:', err);
        this.#onShowToast('Failed to copy appointments to clipboard.', 'error');
      });
    });
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

  #getOverlappingChunks() {
    // make map of overlapping appointments so we can assign them to columns
    const firstAppointmentTime = this.#appointments.reduce((earliest, a) => {
      const startMin = DateUtils.timeToMinutes(a.startTime);
      return Math.min(earliest, startMin);
    }, Infinity);
    const lastAppointmentEndTime = this.#appointments.reduce((latest, a) => {
      const endMin = DateUtils.timeToMinutes(a.startTime) + a.durationMinutes;
      return Math.max(latest, endMin);
    }, -Infinity);

    const overlapChunks = [];
    const idsThatOverlap = [];
    const overlappingMap = new Map();
    let lastChunk = null;
    let lastCurrentlyOverlapping = false;
    let lastInOverlappingChunk = false;
    
    for (let m = firstAppointmentTime; m < lastAppointmentEndTime; m += 15) {
      const overlapping = this.#appointments.filter((a) => {
        const startMin = DateUtils.timeToMinutes(a.startTime);
        const endMin = startMin + a.durationMinutes;
        return startMin < m + 15 && endMin > m;
      });

      const overlappingIds = overlapping.map(a => a.id);

      if (lastChunk && overlapping.length > 1 && !overlappingIds.some(id => lastChunk?.appointments?.has(id))) {
        // in a chunk, but none of the current ids are in this chunk.
        // so finish this one and start a new one immidiately!
        lastChunk.endMinute = m;
        overlapChunks.push(lastChunk);
        lastChunk = {
          startMinute: m,
          endMinute: null,
          appointments: new Map( overlapping.map(a => [a.id, a]) ),
          columns: [...overlapping.map(a => a.id)]
        };
      }
      else if (lastChunk === null && overlapping.length > 1) {
        // wasn't in a chunk, now overlapping. Start new chunk!
        lastChunk = {
          startMinute: m,
          endMinute: null,
          appointments: new Map( overlapping.map(a => [a.id, a]) ),
          columns: [...overlapping.map(a => a.id)]
        };
      }
      else if (lastChunk !== null && overlapping.length <= 1) {
        // was in a chunk, now not overlapping. Finish the chunk.
        lastChunk.endMinute = m;
        overlapChunks.push(lastChunk);
        lastChunk = null;
      }
      else if (lastChunk !== null && overlapping.length > 1) {
        // still in a chunk, add any new appointments to the chunk's map
        for (const a of overlapping) {
          lastChunk.appointments.set(a.id, a);
          if (!lastChunk.columns.includes(a.id)) {
            lastChunk.columns.push(a.id);
          }
        }
      }
    }
    if (lastChunk !== null) {
      lastChunk.endMinute = lastChunk.endMinute ?? lastAppointmentEndTime;
      overlapChunks.push(lastChunk);
    }
    return {
      overlapChunks,
      idsToChunks: new Map(overlapChunks.map(chunk => chunk.columns.map(id => [id, chunk])).flat()),
    };
  }

  #renderAppointments() {
    const { idsToChunks } = this.#getOverlappingChunks();

    for (const appointment of this.#appointments) {
      let numColumns = 1;
      let columnIndex = 0;

      if (idsToChunks.has(appointment.id)) {
        const chunk = idsToChunks.get(appointment.id);
        numColumns = chunk.columns.length;
        columnIndex = chunk.columns.indexOf(appointment.id);
      }

      const block = new AppointmentBlock({
        appointment,
        numColumns,
        columnIndex,
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
        onStatusChange: this.#onStatusChange,
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
