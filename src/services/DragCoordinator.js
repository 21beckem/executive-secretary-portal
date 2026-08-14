import { DateUtils } from '../utils/DateUtils.js';
import { SHOW_START_TIME } from '../components/AppointmentBlock.js';

/**
 * Owns everything about dragging an appointment block from one drop zone
 * (a day column or the Unscheduled column) to another. AppointmentBlock
 * still owns pointer capture and the tap-vs-drag threshold, but delegates
 * all cross-element math here so it doesn't need to reach outside itself
 * to query other columns' DOM — that would break encapsulation.
 *
 * Zones are re-registered on every ScheduleView render (call reset() first),
 * since columns are rebuilt from scratch each time data reloads.
 */
export class DragCoordinator {
  #dragDropController;
  #zones = new Map(); // key -> { key, element, trackElement, gridStartMinutes, gridEndMinutes, isUnscheduled }
  #ghost = null;
  #activeZoneElement = null;

  constructor({ dragDropController }) {
    this.#dragDropController = dragDropController;
  }

  reset() {
    this.#zones.clear();
  }

  /** `key` is a day's ISO date string, or 'unscheduled' for the sidebar column. */
  registerZone(key, { element, trackElement, gridStartMinutes = null, gridEndMinutes = null, isUnscheduled = false }) {
    this.#zones.set(key, { key, element, trackElement, gridStartMinutes, gridEndMinutes, isUnscheduled });
  }

  beginDrag({ blockElement }) {
    blockElement.classList.add('appointment-block--source-hidden');

    const rect = blockElement.getBoundingClientRect();
    const ghost = blockElement.cloneNode(true);
    // Strip layout/state classes from the source so the ghost is just a
    // plain floating card with an explicit pixel size — e.g. the
    // `--static` class's `!important` height:auto rule would otherwise
    // override the fixed height we set below.
    ghost.classList.remove('appointment-block--dragging', 'appointment-block--source-hidden', 'appointment-block--static');
    ghost.classList.add('appointment-block--ghost');
    ghost.style.position = 'fixed';
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.margin = '0';
    document.body.appendChild(ghost);
    this.#ghost = ghost;

    return { originLeft: rect.left, originTop: rect.top };
  }

  /**
   * `pointerOffsetX/Y` is where inside the block the user originally grabbed
   * it, so the ghost tracks the cursor naturally instead of snapping its
   * top-left corner to the pointer.
   */
  updateDrag({ clientX, clientY, pointerOffsetX, pointerOffsetY, durationMinutes }) {
    if (!this.#ghost) return null;

    const zone = this.#findZoneAt(clientX, clientY);
    if (this.#activeZoneElement && this.#activeZoneElement !== zone?.element) {
      this.#activeZoneElement.classList.remove('day-column--drop-target');
    }
    this.#activeZoneElement = zone?.element ?? null;
    if (this.#activeZoneElement) this.#activeZoneElement.classList.add('day-column--drop-target');

    this.#ghost.style.display = !zone ? 'none' : '';
    if (!zone) return null;
    
    const trackRect = zone.trackElement.getBoundingClientRect();
    this.#ghost.style.width = `${trackRect.width - 4}px`;
    this.#ghost.style.marginLeft = '2px';

    // for updating time display on the ghost real time
    const ghostTimeEl = this.#ghost.querySelector('.appointment-block__time');

    if (zone.isUnscheduled) {
      ghostTimeEl?.style.setProperty('display', 'none');
      this.#ghost.style.top = `${trackRect.bottom}px`;
      this.#ghost.style.left = `${trackRect.left}px`;
      return { targetKey: zone.key, appointmentDate: null, startTime: null };
    }

    const offsetInTrack = clientY - trackRect.top - pointerOffsetY;
    let minutes = zone.gridStartMinutes + this.#dragDropController.pixelsToMinutes(offsetInTrack);
    minutes = DateUtils.snapToQuarterHour(minutes);
    const maxStart = zone.gridEndMinutes - durationMinutes;
    minutes = Math.max(zone.gridStartMinutes, Math.min(minutes, maxStart));

    // snap ghost to where it would land if dropped, so the user sees the effect of their drag in real time
    const snappedOffset = this.#dragDropController.minutesToPixels(minutes - zone.gridStartMinutes);
    this.#ghost.style.top = `${trackRect.top + snappedOffset}px`;
    this.#ghost.style.left = `${trackRect.left}px`;
    
    if (ghostTimeEl) {
      ghostTimeEl.style.display = !SHOW_START_TIME ? 'none' : '';
      ghostTimeEl.textContent = DateUtils.formatTimeDisplay(DateUtils.minutesToTime(minutes));
    }

    return { targetKey: zone.key, appointmentDate: zone.key, startTime: DateUtils.minutesToTime(minutes) };
  }

  endDrag(blockElement) {
    if (this.#ghost) {
      this.#ghost.remove();
      this.#ghost = null;
    }
    if (this.#activeZoneElement) {
      this.#activeZoneElement.classList.remove('day-column--drop-target');
      this.#activeZoneElement = null;
    }
    if (blockElement) blockElement.classList.remove('appointment-block--source-hidden');
  }

  #findZoneAt(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    const zoneElement = el?.closest?.('[data-drop-zone]');
    if (!zoneElement) return null;
    for (const zone of this.#zones.values()) {
      if (zone.element === zoneElement) return zone;
    }
    return null;
  }
}
