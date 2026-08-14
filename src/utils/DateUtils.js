/**
 * Pure date/time helpers. No DOM, no state — safe to unit test in isolation.
 * All dates are treated as local time (no timezone conversion needed for a
 * single-ward, single-timezone tool).
 */
export class DateUtils {
  static pad(n) {
    return String(n).padStart(2, '0');
  }

  /** Date -> 'YYYY-MM-DD' */
  static toISODate(date) {
    return `${date.getFullYear()}-${DateUtils.pad(date.getMonth() + 1)}-${DateUtils.pad(date.getDate())}`;
  }

  /** 'YYYY-MM-DD' -> Date (local midnight) */
  static parseISODate(isoString) {
    const [year, month, day] = isoString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  static addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /** Returns the Sunday (local midnight) of the week containing `date`. */
  static getWeekStart(date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    result.setDate(result.getDate() - result.getDay());
    return result;
  }

  /** 0 = Sunday ... 6 = Saturday */
  static dayOfWeek(date) {
    return date.getDay();
  }

  /** 'HH:MM' -> minutes since midnight */
  static timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  /** minutes since midnight -> 'HH:MM' */
  static minutesToTime(totalMinutes) {
    const clamped = Math.max(0, Math.round(totalMinutes));
    const h = Math.floor(clamped / 60) % 24;
    const m = clamped % 60;
    return `${DateUtils.pad(h)}:${DateUtils.pad(m)}`;
  }

  static snapToQuarterHour(minutes) {
    return Math.round(minutes / 15) * 15;
  }

  /** 'HH:MM' -> '7:00 PM' */
  static formatTimeDisplay(timeStr) {
    const minutes = DateUtils.timeToMinutes(timeStr);
    let h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${DateUtils.pad(m)} ${period}`;
  }

  /** Date -> 'Sun, Aug 16' */
  static formatDateHeading(date) {
    const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
    const month = date.toLocaleDateString(undefined, { month: 'short' });
    return `${weekday}, ${month} ${date.getDate()}`;
  }

  /** weekStart Date -> 'Aug 9–15, 2026' (or spans months if needed) */
  static formatWeekRange(weekStart) {
    const weekEnd = DateUtils.addDays(weekStart, 6);
    const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
    const startMonth = weekStart.toLocaleDateString(undefined, { month: 'short' });
    const endMonth = weekEnd.toLocaleDateString(undefined, { month: 'short' });
    if (sameMonth) {
      return `${startMonth} ${weekStart.getDate()}\u2013${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
    }
    return `${startMonth} ${weekStart.getDate()} \u2013 ${endMonth} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
  }

  static isSameDate(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }
}
