const JSON_HEADERS = { 'Content-Type': 'application/json' };
const QUARTER_HOUR_MINUTES = new Set(['00', '15', '30', '45']);
const PATCHABLE_FIELDS = {
  appointments: [
    'person_name',
    'appointment_type_id',
    'duration_minutes',
    'appointment_date',
    'start_time',
    'status',
    'notes',
    'directory_link',
  ],
  prayers: [
    'date',
    'opening_prayer_name',
    'opening_confirmed',
    'closing_prayer_name',
    'closing_confirmed',
  ],
};

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';

    // CORS preflight -- browsers send this without the password header, so
    // it must be answered before any auth check.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      const url = new URL(request.url);
      // Strip a leading /api if your route includes one; harmless if not.
      const path = url.pathname.replace(/^\/api/, '') || '/';

      requireAuth(request, env);

      const response = await route(request, env, path, url.searchParams);
      return withCors(response, origin);
    } catch (err) {
      return withCors(errorResponse(err), origin);
    }
  },
};

async function route(request, env, path, searchParams) {
  const { method } = request;

  // Appointments
  if (path === '/appointments/appointment-types' && method === 'GET') {
    return AppointmentHelpers.listAppointmentTypes(env);
  }
  if (path === '/appointments/availability' && method === 'GET') {
    return AppointmentHelpers.listAvailabilityWindows(env);
  }
  if (path === '/appointments/appointments/unscheduled' && method === 'GET') {
    return AppointmentHelpers.listUnscheduledAppointments(env);
  }
  if (path === '/appointments/appointments' && method === 'GET') {
    return AppointmentHelpers.listAppointments(env, searchParams.get('start'), searchParams.get('end'));
  }
  if (path === '/appointments/appointments' && method === 'POST') {
    return AppointmentHelpers.createAppointment(env, await parseJson(request));
  }

  // Prayers
  if (path === '/prayers/prayer-assignments' && method === 'GET') {
    return PrayerAssignmentHelpers.listPrayerAssignments(env);
  }
  if (path === '/prayers/prayer-assignments' && method === 'POST') {
    return PrayerAssignmentHelpers.createPrayerAssignment(env, await parseJson(request));
  }

  // Appointments
  const appointmentsIdMatch = path.match(/^\/appointments\/appointments\/(\d+)$/);
  if (appointmentsIdMatch && method === 'PATCH') {
    return AppointmentHelpers.updateAppointment(env, Number(appointmentsIdMatch[1]), await parseJson(request));
  }
  if (appointmentsIdMatch && method === 'DELETE') {
    return AppointmentHelpers.deleteAppointment(env, Number(appointmentsIdMatch[1]));
  }

  // Prayers
  const prayerAssignmentsIdMatch = path.match(/^\/prayers\/prayer-assignments\/(\d+)$/);
  if (prayerAssignmentsIdMatch && method === 'PATCH') {
    return PrayerAssignmentHelpers.updatePrayerAssignment(env, Number(prayerAssignmentsIdMatch[1]), await parseJson(request));
  }
  if (prayerAssignmentsIdMatch && method === 'DELETE') {
    return PrayerAssignmentHelpers.deletePrayerAssignment(env, Number(prayerAssignmentsIdMatch[1]));
  }

  throw new ApiError(`Unknown route: ${method} ${path}`, 404);
}

/* ---------------------------------------------------------------------- *
 * Handlers
 * ---------------------------------------------------------------------- */

class AppointmentHelpers {
  static async listAppointmentTypes(env) {
    const { results } = await env.DB.prepare(
      'SELECT id, name, default_duration_minutes, color FROM appointment_types ORDER BY id'
    ).all();
    return jsonResponse(results);
  }
  
  static async listAvailabilityWindows(env) {
    const { results } = await env.DB.prepare(
      'SELECT id, day_of_week, start_time, end_time, label FROM availability_windows ORDER BY day_of_week, start_time'
    ).all();
    return jsonResponse(results);
  }
  
  static async listAppointments(env, start, end) {
    const { results } = await env.DB.prepare(
      `SELECT * FROM appointments
       WHERE appointment_date IS NOT NULL
         AND (?1 IS NULL OR appointment_date >= ?1)
         AND (?2 IS NULL OR appointment_date <= ?2)
       ORDER BY appointment_date, start_time`
    )
      .bind(start ?? null, end ?? null)
      .all();
    return jsonResponse(results);
  }
  
  static async listUnscheduledAppointments(env) {
    const { results } = await env.DB.prepare(
      'SELECT * FROM appointments WHERE start_time IS NULL ORDER BY created_at'
    ).all();
    return jsonResponse(results);
  }
  
  static async createAppointment(env, body) {
    requireFields(body, ['person_name', 'appointment_type_id', 'duration_minutes']);
    assertQuarterHourIfPresent(body.start_time);
    assertBothOrNeither(body.appointment_date, body.start_time);
  
    const now = new Date().toISOString();
    const createdBy = 'exec-secretary'; // replace with a real identity if auth ever grows beyond one shared password
  
    const row = await runReturningOne(
      env,
      `INSERT INTO appointments
         (person_name, appointment_type_id, duration_minutes, appointment_date, start_time,
          status, notes, directory_link, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [
        body.person_name,
        body.appointment_type_id,
        body.duration_minutes,
        body.appointment_date ?? null,
        body.start_time ?? null,
        body.status ?? 'scheduled',
        body.notes ?? null,
        body.directory_link ?? null,
        createdBy,
        now,
        now,
      ]
    );
    return jsonResponse(row, 201);
  }
  
  static async updateAppointment(env, id, body) {
    const fields = Object.keys(body).filter((key) => PATCHABLE_FIELDS.appointments.includes(key));
    if (fields.length === 0) throw new ApiError('No updatable fields provided.', 400);
  
    if (fields.includes('start_time')) assertQuarterHourIfPresent(body.start_time);
  
    // Only enforce the "both or neither" rule when this PATCH actually
    // touches one of the two fields -- a PATCH that only changes, say,
    // duration_minutes shouldn't have to resend date/time.
    if (fields.includes('appointment_date') || fields.includes('start_time')) {
      const existing = await env.DB.prepare('SELECT appointment_date, start_time FROM appointments WHERE id = ?')
        .bind(id)
        .first();
      if (!existing) throw new ApiError('Appointment not found.', 404);
      const nextDate = fields.includes('appointment_date') ? body.appointment_date : existing.appointment_date;
      const nextTime = fields.includes('start_time') ? body.start_time : existing.start_time;
      assertBothOrNeither(nextDate, nextTime);
    }
  
    const setClause = fields.map((field) => `${field} = ?`).join(', ');
    const values = fields.map((field) => body[field] ?? null);
  
    const row = await runReturningOne(
      env,
      `UPDATE appointments SET ${setClause}, updated_at = ? WHERE id = ? RETURNING *`,
      [...values, new Date().toISOString(), id]
    );
    if (!row) throw new ApiError('Appointment not found.', 404);
    return jsonResponse(row);
  }
  
  static async deleteAppointment(env, id) {
    const result = await env.DB.prepare('DELETE FROM appointments WHERE id = ?').bind(id).run();
    if (result.meta.changes === 0) throw new ApiError('Appointment not found.', 404);
    return new Response(null, { status: 204 });
  }
}

class PrayerAssignmentHelpers {
  static async listPrayerAssignments(env) {
    const { results } = await env.DB.prepare(
      'SELECT id, date, opening_prayer_name, opening_confirmed, closing_prayer_name, closing_confirmed FROM prayer_assignments ORDER BY date DESC'
    ).all();
    return jsonResponse(results);
  }
  
  static async createPrayerAssignment(env, body) {
    if (!body.date) throw new ApiError('date is required.', 400);
  
    try {
      const row = await runReturningOne(
        env,
        `INSERT INTO prayer_assignments
          (date, opening_prayer_name, opening_confirmed, closing_prayer_name, closing_confirmed)
        VALUES (?, ?, ?, ?, ?)
        RETURNING *`,
        [
          body.date,
          body.opening_prayer_name ?? null,
          body.opening_confirmed ? 1 : 0,
          body.closing_prayer_name ?? null,
          body.closing_confirmed ? 1 : 0,
        ]
      );
      return jsonResponse(row);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ApiError('A record for that date already exists.', 409);
      }
      throw err;
    }
  }
  
  static async updatePrayerAssignment(env, id, body) {
    const fields = Object.keys(body).filter((key) => PATCHABLE_FIELDS.prayers.includes(key));
    if (fields.length === 0) throw new ApiError('No updatable fields provided.', 400);
  
    const setClause = fields.map((field) => `${field} = ?`).join(', ');
    const values = fields.map((field) => {
      if (field === 'opening_confirmed' || field === 'closing_confirmed') {
        return body[field] ? 1 : 0;
      }
      return body[field] ?? null;
    });
  
    try {
      const row = await runReturningOne(
        env,
        `UPDATE prayer_assignments SET ${setClause} WHERE id = ? RETURNING *`,
        [...values, id]
      );
      if (!row) throw new ApiError('Prayer assignment not found.', 404);
      return jsonResponse(row);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (isUniqueConstraintError(err)) {
        throw new ApiError('A record for that date already exists.', 409);
      }
      throw err;
    }
  }
  
  static async deletePrayerAssignment(env, id) {
    const result = await env.DB.prepare('DELETE FROM prayer_assignments WHERE id = ?').bind(id).run();
    if (result.meta.changes === 0) throw new ApiError('Prayer assignment not found.', 404);
    return jsonResponse({ success: true });
  }
}



/* ---------------------------------------------------------------------- *
 * Helpers
 * ---------------------------------------------------------------------- */

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function isUniqueConstraintError(err) {
  return String(err?.message ?? '').includes('UNIQUE');
}

function requireAuth(request, env) {
  if (!env.APP_PASSWORD) {
    // Fail closed, not open, if the secret was never set.
    throw new ApiError('Server is not configured with an APP_PASSWORD.', 500);
  }
  const provided = request.headers.get('X-App-Password');
  if (provided !== env.APP_PASSWORD) {
    throw new ApiError('Incorrect password.', 401);
  }
}

function requireFields(body, fieldNames) {
  const missing = fieldNames.filter((name) => body?.[name] === undefined || body?.[name] === null);
  if (missing.length > 0) {
    throw new ApiError(`Missing required field(s): ${missing.join(', ')}`, 400);
  }
}

function assertQuarterHourIfPresent(startTime) {
  if (startTime == null) return;
  const minutePart = String(startTime).split(':')[1];
  if (!QUARTER_HOUR_MINUTES.has(minutePart)) {
    throw new ApiError('start_time must be on a 15-minute interval.', 400);
  }
}

/** appointment_date and start_time must be both null (unscheduled) or both set. */
function assertBothOrNeither(date, time) {
  const hasDate = date != null;
  const hasTime = time != null;
  if (hasDate !== hasTime) {
    throw new ApiError('appointment_date and start_time must both be set, or both left blank.', 400);
  }
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    throw new ApiError('Request body must be valid JSON.', 400);
  }
}

/** Runs an INSERT/UPDATE ... RETURNING * and surfaces D1's UNIQUE violation as a clean 409. */
async function runReturningOne(env, sql, params) {
  try {
    const result = await env.DB.prepare(sql).bind(...params).first();
    return result ?? null;
  } catch (err) {
    if (String(err.message).toUpperCase().includes('UNIQUE')) {
      throw new ApiError('An appointment already exists at that time.', 409);
    }
    throw err;
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function errorResponse(err) {
  const status = err instanceof ApiError ? err.status : 500;
  if (!(err instanceof ApiError)) console.error(err);
  return jsonResponse({ error: err.message ?? 'Internal error' }, status);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Password',
    'Access-Control-Max-Age': '86400',
  };
}

function withCors(response, origin) {
  const headers = new Headers(response.headers);
  const cors = corsHeaders(origin);
  for (const [key, value] of Object.entries(cors)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}