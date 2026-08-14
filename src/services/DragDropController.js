/**
 * Pure pixel <-> minute conversion and snapping math, deliberately kept out
 * of AppointmentBlock so it's unit-testable without touching the DOM, and so
 * every component that needs to convert between "pixels on screen" and
 * "minutes since midnight" shares the exact same scale.
 */
export class DragDropController {
  #pixelsPerMinute;
  #snapIntervalMinutes;

  constructor({ pixelsPerMinute, snapIntervalMinutes = 15 }) {
    this.#pixelsPerMinute = pixelsPerMinute;
    this.#snapIntervalMinutes = snapIntervalMinutes;
  }

  get pixelsPerMinute() {
    return this.#pixelsPerMinute;
  }

  minutesToPixels(minutes) {
    return minutes * this.#pixelsPerMinute;
  }

  pixelsToMinutes(pixels) {
    return pixels / this.#pixelsPerMinute;
  }

  /**
   * Given how far a block has been dragged vertically (in pixels), returns
   * the new start time in minutes, snapped to the nearest 15-minute mark and
   * clamped within [minStartMinutes, maxStartMinutes].
   */
  getSnappedStartMinutes({ deltaPixels, originalStartMinutes, minStartMinutes, maxStartMinutes }) {
    const deltaMinutes = this.pixelsToMinutes(deltaPixels);
    let next = originalStartMinutes + deltaMinutes;
    next = Math.round(next / this.#snapIntervalMinutes) * this.#snapIntervalMinutes;
    next = Math.max(minStartMinutes, Math.min(next, maxStartMinutes));
    return next;
  }
}
