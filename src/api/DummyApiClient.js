import { ApiError } from './ApiError.js';

// For testing the sign-in gate in this first draft. Not a real secret.
const DUMMY_PASSWORD = 'letmein123';
const SIMULATED_LATENCY_MS = 250;

/**
 * Stands in for the real Worker API during development. Implements the same
 * public shape (get/post/patch/delete, snake_case payloads) as ApiClient so
 * swapping one for the other in main.js is a one-line change.
 *
 * Seed data below uses the week of Sun Aug 9 - Sat Aug 15, 2026, and covers:
 *  - a normal Sunday/Tuesday/Thursday schedule
 *  - one appointment (id 4) placed BEFORE the Tuesday window opens, to
 *    demonstrate the "outside availability" yellow warning
 *  - one appointment (id 6) on a Friday, a day with no availability window
 *    at all, to demonstrate the "exception day still shows up" behavior
 *  - two unscheduled appointments (ids 7, 8), one of them with a directory
 *    link, to test the Unscheduled column and the directory-link icon
 */
export class DummyApiClient {
  #getPassword;
  #appointmentTypes;
  #availabilityWindows;
  #appointments;
  #nextId;

  constructor({ getPassword }) {
    this.#getPassword = getPassword;

    this.#appointmentTypes = [
      { id: 1, name: 'Bishop Chat', default_duration_minutes: 30, color: '#3B5BA5' },
      { id: 2, name: 'Temple Recommend', default_duration_minutes: 15, color: '#4F8F6B' },
      { id: 3, name: 'Living Ordinance Recommend', default_duration_minutes: 60, color: '#7C5CA8' },
      { id: 4, name: 'Endorsement', default_duration_minutes: 15, color: '#C97B4A' },
      { id: 5, name: 'Tithing Declaration', default_duration_minutes: 15, color: '#3F9C93' },
      { id: 6, name: 'Calling', default_duration_minutes: 15, color: '#B08D57' },
      { id: 7, name: 'Other', default_duration_minutes: 30, color: '#6E7480' },
    ];

    this.#availabilityWindows = [
      { id: 1, day_of_week: 0, start_time: '08:00', end_time: '14:00', label: 'Sunday block' },
      { id: 2, day_of_week: 2, start_time: '18:00', end_time: '21:00', label: 'Tuesday evening' },
      { id: 3, day_of_week: 4, start_time: '18:00', end_time: '21:00', label: 'Thursday evening' },
    ];

    this.#appointments = [
      { id: 1, person_name: 'James Carter', appointment_type_id: 1, duration_minutes: 30, appointment_date: '2026-08-09', start_time: '08:15', status: 'scheduled', notes: null, directory_link: null, created_by: 'dummy@example.com', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' },
      { id: 2, person_name: 'Linda Ortiz', appointment_type_id: 2, duration_minutes: 15, appointment_date: '2026-08-09', start_time: '09:00', status: 'scheduled', notes: null, directory_link: 'https://example.com/directory/linda-ortiz', created_by: 'dummy@example.com', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' },
      { id: 3, person_name: 'Michael Nguyen', appointment_type_id: 6, duration_minutes: 15, appointment_date: '2026-08-11', start_time: '18:00', status: 'scheduled', notes: null, directory_link: null, created_by: 'dummy@example.com', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' },
      { id: 4, person_name: 'Sarah Kim', appointment_type_id: 7, duration_minutes: 30, appointment_date: '2026-08-11', start_time: '17:15', status: 'scheduled', notes: 'Asked to meet before the normal window - had a conflict later.', directory_link: null, created_by: 'dummy@example.com', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' },
      { id: 5, person_name: 'David Park', appointment_type_id: 3, duration_minutes: 60, appointment_date: '2026-08-13', start_time: '19:30', status: 'scheduled', notes: null, directory_link: null, created_by: 'dummy@example.com', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' },
      { id: 6, person_name: 'Emily Chen', appointment_type_id: 4, duration_minutes: 15, appointment_date: '2026-08-14', start_time: '16:00', status: 'scheduled', notes: 'Special exception - leaving on a trip before Sunday.', directory_link: null, created_by: 'dummy@example.com', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' },
      { id: 7, person_name: 'Robert Alvarez', appointment_type_id: 1, duration_minutes: 30, appointment_date: null, start_time: null, status: 'scheduled', notes: 'Wants to talk sometime, no rush.', directory_link: 'https://example.com/directory/robert-alvarez', created_by: 'dummy@example.com', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' },
      { id: 8, person_name: 'Grace Thompson', appointment_type_id: 5, duration_minutes: 15, appointment_date: null, start_time: null, status: 'scheduled', notes: null, directory_link: null, created_by: 'dummy@example.com', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' },
    ];

    this.#nextId = 100;
  }

  async #simulateLatency() {
    return new Promise((resolve) => setTimeout(resolve, SIMULATED_LATENCY_MS));
  }

  #checkAuth() {
    if (this.#getPassword() !== DUMMY_PASSWORD) {
      throw new ApiError('Incorrect password.', 401);
    }
  }

  async get(path) {
    await this.#simulateLatency();
    this.#checkAuth();
    const [route, queryString] = path.split('?');
    const params = new URLSearchParams(queryString ?? '');

    if (route === '/appointment-types') {
      return this.#appointmentTypes.map((t) => ({ ...t }));
    }
    if (route === '/availability') {
      return this.#availabilityWindows.map((w) => ({ ...w }));
    }
    if (route === '/appointments/unscheduled') {
      return this.#appointments.filter((a) => a.start_time == null).map((a) => ({ ...a }));
    }
    if (route === '/appointments') {
      const start = params.get('start');
      const end = params.get('end');
      return this.#appointments
        .filter((a) => a.appointment_date != null)
        .filter((a) => (!start || a.appointment_date >= start) && (!end || a.appointment_date <= end))
        .map((a) => ({ ...a }));
    }
    throw new ApiError(`Unknown route: ${route}`, 404);
  }

  async post(path, body) {
    await this.#simulateLatency();
    this.#checkAuth();

    if (path === '/appointments') {
      if (body.start_time) this.#assertQuarterHour(body.start_time);
      const record = {
        id: this.#nextId++,
        person_name: body.person_name,
        appointment_type_id: body.appointment_type_id,
        duration_minutes: body.duration_minutes,
        appointment_date: body.appointment_date ?? null,
        start_time: body.start_time ?? null,
        status: body.status ?? 'scheduled',
        notes: body.notes ?? null,
        directory_link: body.directory_link ?? null,
        created_by: 'dummy@example.com',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.#assertNoCollision(record.appointment_date, record.start_time, null);
      this.#appointments.push(record);
      return { ...record };
    }
    throw new ApiError(`Unknown route: ${path}`, 404);
  }

  async patch(path, body) {
    await this.#simulateLatency();
    this.#checkAuth();

    const match = path.match(/^\/appointments\/(\d+)$/);
    if (match) {
      const id = Number(match[1]);
      const record = this.#appointments.find((a) => a.id === id);
      if (!record) throw new ApiError('Appointment not found.', 404);

      if (body.start_time) this.#assertQuarterHour(body.start_time);

      const nextDate = body.hasOwnProperty('appointment_date') ? body.appointment_date : record.appointment_date;
      const nextStart = body.hasOwnProperty('start_time') ? body.start_time : record.start_time;
      this.#assertNoCollision(nextDate, nextStart, id);

      Object.assign(record, body, { updated_at: new Date().toISOString() });
      return { ...record };
    }
    throw new ApiError(`Unknown route: ${path}`, 404);
  }

  async delete(path) {
    await this.#simulateLatency();
    this.#checkAuth();

    const match = path.match(/^\/appointments\/(\d+)$/);
    if (match) {
      const id = Number(match[1]);
      const index = this.#appointments.findIndex((a) => a.id === id);
      if (index === -1) throw new ApiError('Appointment not found.', 404);
      this.#appointments.splice(index, 1);
      return null;
    }
    throw new ApiError(`Unknown route: ${path}`, 404);
  }

  #assertQuarterHour(startTime) {
    const minutePart = startTime.split(':')[1];
    if (!['00', '15', '30', '45'].includes(minutePart)) {
      throw new ApiError('start_time must be on a 15-minute interval.', 400);
    }
  }

  #assertNoCollision(date, startTime, excludeId) {
    if (date == null || startTime == null) return; // unscheduled — never collides
    const collision = this.#appointments.find(
      (a) => a.id !== excludeId && a.appointment_date === date && a.start_time === startTime
    );
    if (collision) {
      throw new ApiError('An appointment already exists at that time.', 409);
    }
  }
}
