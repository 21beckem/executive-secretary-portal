import { DateUtils } from '../utils/DateUtils.js';
import { escapeHtml, colorToTintedWhite } from '../utils/helpers.js';

// Toggle whether the start time is shown on the block face. Off by default
// since block color + position on the grid already conveys the time, and
// compact 15-minute blocks have very little room.
export const SHOW_START_TIME = true;

/**
 * Renders one appointment as a card — either absolutely positioned on a
 * day's time grid ('timed' layout) or stacked in the Unscheduled column
 * ('static' layout). Uses Pointer Events so the same drag logic works on
 * desktop and mobile. A short tap (no meaningful movement) opens the edit
 * form; a drag beyond a small threshold hands off to the shared
 * DragCoordinator, which supports dropping onto any day column or the
 * Unscheduled column — not just the one this block started in.
 */
export class AppointmentBlock {
  #appointment;
  #appointmentType;
  #isOutsideAvailability;
  #layout; // 'timed' | 'static'
  #homeKey; // the ISO date this block started in, or 'unscheduled'
  #gridStartMinutes;
  #gridEndMinutes;
  #dragDropController;
  #dragCoordinator;
  #onMove;
  #onEdit;
  #element;
  #dragState = null;

  constructor({
    appointment,
    appointmentType,
    isOutsideAvailability = false,
    layout = 'timed',
    homeKey,
    gridStartMinutes = null,
    gridEndMinutes = null,
    dragDropController,
    dragCoordinator,
    onMove,
    onEdit,
  }) {
    this.#appointment = appointment;
    this.#appointmentType = appointmentType;
    this.#isOutsideAvailability = isOutsideAvailability;
    this.#layout = layout;
    this.#homeKey = homeKey;
    this.#gridStartMinutes = gridStartMinutes;
    this.#gridEndMinutes = gridEndMinutes;
    this.#dragDropController = dragDropController;
    this.#dragCoordinator = dragCoordinator;
    this.#onMove = onMove;
    this.#onEdit = onEdit;
    this.#element = this.#buildElement();
    this.#attachListeners();
  }

  get element() {
    return this.#element;
  }

  get appointment() {
    return this.#appointment;
  }

  #buildElement() {
    const el = document.createElement('div');
    el.className = 'appointment-block';
    if (this.#layout === 'static') el.classList.add('appointment-block--static');
    if (this.#isOutsideAvailability) el.classList.add('appointment-block--warning');
    if (this.#appointment.durationMinutes <= 15) el.classList.add('appointment-block--compact');
    el.tabIndex = 0;
    this.#applyColor(el);
    this.#renderContent(el);
    if (this.#layout === 'timed') this.#positionElement(el);
    return el;
  }

  #applyColor(el) {
    const color = this.#appointmentType?.color ?? '#6E7480';
    el.style.borderLeftColor = color;
    el.style.backgroundColor = colorToTintedWhite(color);
  }

  #renderContent(el) {
    const showTime = SHOW_START_TIME && !this.#appointment.isUnscheduled;
    const hasDirectoryLink = Boolean(this.#appointment.directoryLink);
    el.innerHTML = `
      ${showTime ? `<span class="appointment-block__time">${DateUtils.formatTimeDisplay(this.#appointment.startTime)}</span>` : ''}
      <span class="appointment-block__name">${escapeHtml(this.#appointment.personName)}</span>
      <span class="appointment-block__type">${escapeHtml(this.#appointmentType?.name ?? '')}</span>
      ${this.#isOutsideAvailability ? '<span class="appointment-block__warning-badge" title="Outside the bishop\u2019s normal availability">!</span>' : ''}
      ${hasDirectoryLink ? '<button type="button" class="appointment-block__directory-link" title="Open in ward directory" aria-label="Open in ward directory">\u{1F464}</button>' : ''}
    `;
    if (hasDirectoryLink) {
      el.querySelector('.appointment-block__directory-link').addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(this.#appointment.directoryLink, '_blank', 'noopener');
      });
    }
  }

  #positionElement(el) {
    const top = this.#dragDropController.minutesToPixels(this.#appointment.startMinutes - this.#gridStartMinutes);
    const height = this.#dragDropController.minutesToPixels(this.#appointment.durationMinutes);
    el.style.top = `${top}px`;
    el.style.height = `${Math.max(height - 2, 18)}px`;
  }

  update({ appointment, isOutsideAvailability, gridStartMinutes, gridEndMinutes }) {
    this.#appointment = appointment;
    this.#isOutsideAvailability = isOutsideAvailability;
    if (gridStartMinutes != null) this.#gridStartMinutes = gridStartMinutes;
    if (gridEndMinutes != null) this.#gridEndMinutes = gridEndMinutes;
    this.#element.classList.toggle('appointment-block--warning', isOutsideAvailability);
    this.#element.classList.toggle('appointment-block--compact', appointment.durationMinutes <= 15);
    this.#applyColor(this.#element);
    this.#renderContent(this.#element);
    if (this.#layout === 'timed') this.#positionElement(this.#element);
  }

  #attachListeners() {
    this.#element.addEventListener('pointerdown', this.#handlePointerDown);
    this.#element.addEventListener('keydown', this.#handleKeyDown);
  }

  #handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.#onEdit(this.#appointment);
    }
  };

  #handlePointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('.appointment-block__directory-link')) return; // let the icon's own click fire
    e.preventDefault();
    this.#element.setPointerCapture(e.pointerId);
    const rect = this.#element.getBoundingClientRect();
    this.#dragState = {
      startX: e.clientX,
      startY: e.clientY,
      pointerOffsetX: e.clientX - rect.left,
      pointerOffsetY: e.clientY - rect.top,
      moved: false,
      ghostStarted: false,
      pending: null,
    };
    this.#element.addEventListener('pointermove', this.#handlePointerMove);
    this.#element.addEventListener('pointerup', this.#handlePointerUp);
    this.#element.addEventListener('pointercancel', this.#handlePointerUp);
  };

  #handlePointerMove = (e) => {
    const state = this.#dragState;
    if (!state) return;

    const deltaX = e.clientX - state.startX;
    const deltaY = e.clientY - state.startY;
    if (!state.moved && Math.hypot(deltaX, deltaY) > 4) {
      state.moved = true;
    }
    if (!state.moved) return;

    if (!state.ghostStarted) {
      this.#dragCoordinator.beginDrag({ blockElement: this.#element });
      state.ghostStarted = true;
    }

    state.pending = this.#dragCoordinator.updateDrag({
      clientX: e.clientX,
      clientY: e.clientY,
      pointerOffsetX: state.pointerOffsetX,
      pointerOffsetY: state.pointerOffsetY,
      durationMinutes: this.#appointment.durationMinutes,
    });
  };

  #handlePointerUp = (e) => {
    this.#element.releasePointerCapture(e.pointerId);
    this.#element.removeEventListener('pointermove', this.#handlePointerMove);
    this.#element.removeEventListener('pointerup', this.#handlePointerUp);
    this.#element.removeEventListener('pointercancel', this.#handlePointerUp);

    const state = this.#dragState;
    this.#dragState = null;
    if (!state) return;

    if (!state.moved) {
      this.#onEdit(this.#appointment);
      return;
    }

    if (!state.pending) { // dropped outside any known zone — just restore
      this.#dragCoordinator.endDrag(this.#element);
      return;
    }

    const changed =
      state.pending.targetKey !== this.#homeKey ||
      state.pending.startTime !== this.#appointment.startTime;

    if (changed) {
      this.#onMove(this.#appointment.id, {
        appointmentDate: state.pending.appointmentDate,
        startTime: state.pending.startTime,
      }).then(() => {
        this.#dragCoordinator.endDrag(this.#element);
      });
    } else {
      this.#dragCoordinator.endDrag(this.#element);
    }
  };
}
