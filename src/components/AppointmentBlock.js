import { DateUtils } from '../utils/DateUtils.js';
import { escapeHtml, colorToTintedWhite, findScrollableAncestor } from '../utils/helpers.js';

// Toggle whether the start time is shown on the block face.
export const SHOW_START_TIME = true;

const DRAG_THRESHOLD_PX = 4;        // mouse: distance before a drag is considered to have started
const TOUCH_MOVE_TOLERANCE_PX = 8;  // touch: total movement allowed during the hold before it's treated as a scroll
const LONG_PRESS_MS = 450;          // touch: how long you must hold before dragging begins

const STATUS_CYCLE = ['unset', 'scheduled', 'canceled'];
const STATUS_GLYPHS = { unset: '', scheduled: '\u2713', canceled: '\u2715' };

function nextStatus(current) {
  const index = STATUS_CYCLE.indexOf(current);
  return STATUS_CYCLE[(index + 1) % STATUS_CYCLE.length];
}

/**
 * Renders one appointment as a card — either absolutely positioned on a
 * day's time grid ('timed' layout) or stacked in the Unscheduled column
 * ('static' layout).
 *
 * Drag behavior differs by input type:
 *  - Mouse (and pen): dragging begins as soon as the pointer moves past a
 *    small threshold.
 *  - Touch: this element has `touch-action: none` (see CSS), which fully
 *    opts it out of the browser's own panning/zooming for any touch that
 *    starts on it — touch-action can't be switched dynamically mid-gesture
 *    in a way browsers honor, so instead we own the whole gesture from the
 *    start and manually replicate scrolling ourselves until/unless a
 *    sustained hold turns it into a drag.
 *
 * The status checkbox (left of the name) and the directory-link icon
 * (top-right) both intercept pointerdown before any drag/tap logic runs,
 * so tapping either never triggers a drag or opens the edit form.
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
  #onStatusChange;
  #element;
  #statusButton;
  #scrollDirection = null; // 'x' | 'y' | null, set once a touch gesture is committed to scrolling
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
    onStatusChange,
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
    this.#onStatusChange = onStatusChange;
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
    const status = this.#appointment.status ?? 'unset';

    el.innerHTML = `
      ${showTime ? `<span class="appointment-block__time">${DateUtils.formatTimeDisplay(this.#appointment.startTime)}</span>` : ''}
      <div class="appointment-block__name-row">
        <button type="button" class="appointment-block__status" data-status="${status}" title="Cycle status" aria-label="Cycle appointment status">${STATUS_GLYPHS[status] ?? ''}</button>
        <span class="appointment-block__name">${escapeHtml(this.#appointment.personName)}</span>
      </div>
      <span class="appointment-block__type">${escapeHtml(this.#appointmentType?.name ?? '')}</span>
      ${this.#isOutsideAvailability ? '<span class="appointment-block__warning-badge" title="Outside the bishop\u2019s normal availability">!</span>' : ''}
      ${hasDirectoryLink ? '<button type="button" class="appointment-block__directory-link" title="Open in ward directory" aria-label="Open in ward directory">\u{1F464}</button>' : ''}
    `;

    this.#statusButton = el.querySelector('.appointment-block__status');
    this.#statusButton.addEventListener('click', this.#handleStatusClick);

    if (hasDirectoryLink) {
      el.querySelector('.appointment-block__directory-link').addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(this.#appointment.directoryLink, '_blank', 'noopener');
      });
    }
  }

  #handleStatusClick = (e) => {
    e.stopPropagation();
    const next = nextStatus(this.#appointment.status ?? 'unset');
    // Instant visual feedback — the eventual reload will reconcile with the server's copy.
    this.#statusButton.dataset.status = next;
    this.#statusButton.textContent = STATUS_GLYPHS[next] ?? '';
    this.#onStatusChange(this.#appointment.id, next);
  };

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
    // Let the status checkbox and the directory-link icon handle their own clicks —
    // neither should start a drag or an edit-tap.
    if (e.target.closest('.appointment-block__status')) return;
    if (e.target.closest('.appointment-block__directory-link')) return;
    const isTouch = e.pointerType === 'touch';

    const rect = this.#element.getBoundingClientRect();
    this.#dragState = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      pointerOffsetX: e.clientX - rect.left,
      pointerOffsetY: e.clientY - rect.top,
      dragActive: false,
      pending: null,
      longPressTimer: null,
      scrollLocked: false, // touch: true once movement has committed this gesture to "scrolling", never dragging
      vScroller: null,
      hScroller: null,
    };

    if (isTouch) {
      // touch-action: none means the browser won't scroll on our behalf —
      // we replicate it manually until/unless the hold turns into a drag.
      this.#dragState.vScroller = findScrollableAncestor(this.#element, 'y');
      this.#dragState.hScroller = findScrollableAncestor(this.#element, 'x');
      this.#element.classList.add('appointment-block--pressing');
      document.addEventListener('pointermove', this.#handlePendingMove);
      document.addEventListener('pointerup', this.#handlePendingEnd);
      document.addEventListener('pointercancel', this.#handlePendingEnd);
      this.#dragState.longPressTimer = setTimeout(() => this.#activateDrag(), LONG_PRESS_MS);
    } else {
      // Mouse / pen: no ambiguity with scrolling, so drag can arm immediately.
      e.preventDefault();
      this.#element.setPointerCapture(e.pointerId);
      this.#element.addEventListener('pointermove', this.#handleActiveMove);
      this.#element.addEventListener('pointerup', this.#handleActiveEnd);
      this.#element.addEventListener('pointercancel', this.#handleActiveEnd);
    }
  };

  // --- Touch pre-drag ("holding") phase — document-level listeners so we
  // keep seeing the pointer even if the manual scroll below moves this
  // element out from under the finger. ---

  #handlePendingMove = (e) => {
    const state = this.#dragState;
    if (!state || e.pointerId !== state.pointerId) return;

    const deltaX = e.clientX - state.lastX;
    const deltaY = e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    if (this.#scrollDirection === null && Math.abs(deltaY) > 2) this.#scrollDirection = 'y';
    if (this.#scrollDirection === null && Math.abs(deltaX) > 2 && state.hScroller !== state.vScroller) this.#scrollDirection = 'x';


    // Manually replicate native scrolling on whichever real container it
    // would normally affect, since touch-action: none disabled it here.
    if (this.#scrollDirection === 'y' && state.vScroller) state.vScroller.scrollTop -= deltaY;
    if (this.#scrollDirection === 'x' && state.hScroller && state.hScroller !== state.vScroller) state.hScroller.scrollLeft -= deltaX;

    if (!state.scrollLocked) {
      const totalDistance = Math.hypot(e.clientX - state.startX, e.clientY - state.startY);
      if (totalDistance > TOUCH_MOVE_TOLERANCE_PX) {
        // Moved enough to be a deliberate scroll — this gesture can no
        // longer become a drag, but keep scrolling for the rest of it.
        state.scrollLocked = true;
        if (state.longPressTimer) {
          clearTimeout(state.longPressTimer);
          state.longPressTimer = null;
        }
        this.#element.classList.remove('appointment-block--pressing');
      }
    }
  };

  #handlePendingEnd = (e) => {
    const state = this.#dragState;
    if (!state || e.pointerId !== state.pointerId) return;
    this.#detachPendingListeners();
    if (state.longPressTimer) clearTimeout(state.longPressTimer);
    this.#element.classList.remove('appointment-block--pressing');
    const wasScrollLocked = state.scrollLocked;
    this.#dragState = null;
    this.#scrollDirection = null;
    if (!wasScrollLocked) {
      setTimeout(() => this.#onEdit(this.#appointment), 10); // never scrolled, never dragged = a genuine tap
    }
  };

  #detachPendingListeners() {
    document.removeEventListener('pointermove', this.#handlePendingMove);
    document.removeEventListener('pointerup', this.#handlePendingEnd);
    document.removeEventListener('pointercancel', this.#handlePendingEnd);
  }

  /** Touch only: the hold completed without exceeding the movement tolerance — commit to dragging. */
  #activateDrag() {
    const state = this.#dragState;
    if (!state || state.dragActive || state.scrollLocked) return;
    this.#detachPendingListeners();
    state.longPressTimer = null;
    state.dragActive = true;
    this.#element.classList.remove('appointment-block--pressing');

    try {
      this.#element.setPointerCapture(state.pointerId);
    } catch {
      /* pointer may already be gone if lifted right as the timer fired — #handleActiveEnd handles that */
    }
    this.#element.addEventListener('pointermove', this.#handleActiveMove);
    this.#element.addEventListener('pointerup', this.#handleActiveEnd);
    this.#element.addEventListener('pointercancel', this.#handleActiveEnd);
    this.#dragCoordinator.beginDrag({ blockElement: this.#element });
  }

  // --- Active drag phase — shared by mouse (immediate) and touch (post hold) ---

  #handleActiveMove = (e) => {
    const state = this.#dragState;
    if (!state) return;

    if (!state.dragActive) {
      // Mouse-only path: promote to an active drag once past the small threshold.
      const distance = Math.hypot(e.clientX - state.startX, e.clientY - state.startY);
      if (distance <= DRAG_THRESHOLD_PX) return;
      state.dragActive = true;
      this.#dragCoordinator.beginDrag({ blockElement: this.#element });
    }

    e.preventDefault();
    state.pending = this.#dragCoordinator.updateDrag({
      clientX: e.clientX,
      clientY: e.clientY,
      pointerOffsetX: state.pointerOffsetX,
      pointerOffsetY: state.pointerOffsetY,
      durationMinutes: this.#appointment.durationMinutes,
    });
  };

  #handleActiveEnd = (e) => {
    const state = this.#dragState;
    if (!state) return;

    this.#element.removeEventListener('pointermove', this.#handleActiveMove);
    this.#element.removeEventListener('pointerup', this.#handleActiveEnd);
    this.#element.removeEventListener('pointercancel', this.#handleActiveEnd);
    try {
      this.#element.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }

    this.#dragState = null;

    if (!state.dragActive) {
      // Touch: the hold fired but the pointer lifted before any movement was seen — treat as a tap.
      setTimeout(() => this.#onEdit(this.#appointment), 10);
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
