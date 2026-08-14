import { DateUtils } from '../utils/DateUtils.js';

/**
 * Everything about "is this appointment in a normal slot" and "which days
 * should this week even show" is computed here, live, from
 * availability_windows + appointments. Nothing about exceptions is ever
 * stored — it's a derived fact, so it can never drift out of sync with the
 * actual availability configuration.
 */
export class AvailabilityCalculator {
  #windowsByDay;

  constructor(availabilityWindows) {
    this.#windowsByDay = new Map();
    for (const w of availabilityWindows) {
      if (!this.#windowsByDay.has(w.dayOfWeek)) this.#windowsByDay.set(w.dayOfWeek, []);
      this.#windowsByDay.get(w.dayOfWeek).push(w);
    }
  }

  getWindowsForDay(dayOfWeek) {
    return this.#windowsByDay.get(dayOfWeek) ?? [];
  }

  /** True if the appointment falls entirely inside one of that day's availability windows. */
  isWithinAvailability(appointment) {
    if (appointment.isUnscheduled) return true; // not on the calendar at all — no warning applies
    const windows = this.getWindowsForDay(appointment.dayOfWeek);
    const start = appointment.startMinutes;
    const end = appointment.endMinutes;
    return windows.some(
      (w) => start >= DateUtils.timeToMinutes(w.startTime) && end <= DateUtils.timeToMinutes(w.endTime)
    );
  }

  /**
   * Returns the days of `weekStart`'s week that should render: any day with
   * a configured availability window, PLUS any day with at least one
   * *scheduled* appointment on it (even with no window — that's the "don't
   * let me forget an odd appointment" guarantee). Unscheduled appointments
   * have no date, so they never affect which days show — they live in the
   * permanent Unscheduled column instead.
   */
  getVisibleDaysForWeek(weekStart, appointments) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = DateUtils.addDays(weekStart, i);
      const iso = DateUtils.toISODate(date);
      const windows = this.getWindowsForDay(i);
      const dayAppointments = appointments.filter((a) => a.appointmentDate === iso);
      const hasWindow = windows.length > 0;
      if (hasWindow || dayAppointments.length > 0) {
        days.push({ date, iso, dayOfWeek: i, windows, appointments: dayAppointments, isRegularDay: hasWindow });
      }
    }
    return days;
  }

  /**
   * Time range (start/end minutes) for a SINGLE day, covering just that
   * day's own availability windows plus any of its appointments that fall
   * outside them. Each day gets its own range now (no shared week-wide
   * axis), so a short Tuesday-evening column and a long Sunday column each
   * render at their true height — 15 minutes is always the same number of
   * pixels regardless of which day it's in.
   */
  getTimeBoundsForDay(day, { paddingMinutes = 30, fallbackStart = 8 * 60, fallbackEnd = 21 * 60, roundToNearest = 30 } = {}) {
    let min = Infinity;
    let max = -Infinity;
    for (const w of day.windows) {
      min = Math.min(min, DateUtils.timeToMinutes(w.startTime));
      max = Math.max(max, DateUtils.timeToMinutes(w.endTime));
    }
    for (const a of day.appointments) {
      if (a.isUnscheduled) continue;
      min = Math.min(min, a.startMinutes);
      max = Math.max(max, a.endMinutes);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { startMinutes: fallbackStart, endMinutes: fallbackEnd };
    }
    min = Math.max(0, Math.floor((min - paddingMinutes) / roundToNearest) * roundToNearest);
    max = Math.min(24 * 60, Math.ceil((max + paddingMinutes) / roundToNearest) * roundToNearest);
    return { startMinutes: min, endMinutes: max };
  }
}
