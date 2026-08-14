/**
 * Bishop's Schedule -- Cloudflare Worker API
 *
 * Endpoints (all under whatever route you bind this Worker to, e.g.
 * https://your-worker.your-subdomain.workers.dev/api/...):
 *
 *   GET    /appointment-types
 *   GET    /availability
 *   GET    /appointments?start=YYYY-MM-DD&end=YYYY-MM-DD
 *   GET    /appointments/unscheduled
 *   POST   /appointments
 *   PATCH  /appointments/:id
 *   DELETE /appointments/:id
 *
 * This is the exact interface DummyApiClient.js already simulates in the
 * client -- swapping it in is a one-line change in main.js (see the "Swap
 * point" comment there). Nothing else in the client needs to change.
 *
 * --- Setup ---
 *
 * 1. D1 binding -- in wrangler.toml:
 *      [[d1_databases]]
 *      binding = "DB"
 *      database_name = "bishop-scheduler"
 *      database_id = "<your-database-id>"
 *
 * 2. Master password (secret, not a plain var):
 *      wrangler secret put APP_PASSWORD
 *
 * 3. (Optional) Restrict CORS to your GitHub Pages origin instead of "*":
 *      wrangler secret put ALLOWED_ORIGIN
 *    e.g. https://yourusername.github.io -- omit to allow any origin.
 *
 * 4. Deploy: wrangler deploy
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const QUARTER_HOUR_MINUTES = new Set(['00', '15', '30', '45']);
const PATCHABLE_FIELDS = [
  'person_name',
  'appointment_type_id',
  'duration_minutes',
  'appointment_date',
  'start_time',
  'status',
  'notes',
  'directory_link',
];

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

  if (path === '/appointment-types' && method === 'GET') {
    return listAppointmentTypes(env);
  }
  if (path === '/availability' && method === 'GET') {
    return listAvailabilityWindows(env);
  }
  if (path === '/appointments/unscheduled' && method === 'GET') {
    return listUnscheduledAppointments(env);
  }
  if (path === '/appointments' && method === 'GET') {
    return listAppointments(env, searchParams.get('start'), searchParams.get('end'));
  }
  if (path === '/appointments' && method === 'POST') {
    return createAppointment(env, await parseJson(request));
  }

  const idMatch = path.match(/^\/appointments\/(\d+)$/);
  if (idMatch && method === 'PATCH') {
    return updateAppointment(env, Number(idMatch[1]), await parseJson(request));
  }
  if (idMatch && method === 'DELETE') {
    return deleteAppointment(env, Number(idMatch[1]));
  }

  throw new ApiError(`Unknown route: ${method} ${path}`, 404);
}

/* ---------------------------------------------------------------------- *
 * Handlers
 * ---------------------------------------------------------------------- */

async function listAppointmentTypes(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, default_duration_minutes, color FROM appointment_types ORDER BY id'
  ).all();
  return jsonResponse(results);
}

async function listAvailabilityWindows(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, day_of_week, start_time, end_time, label FROM availability_windows ORDER BY day_of_week, start_time'
  ).all();
  return jsonResponse(results);
}

async function listAppointments(env, start, end) {
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

async function listUnscheduledAppointments(env) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM appointments WHERE start_time IS NULL ORDER BY created_at'
  ).all();
  return jsonResponse(results);
}

async function createAppointment(env, body) {
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

async function updateAppointment(env, id, body) {
  const fields = Object.keys(body).filter((key) => PATCHABLE_FIELDS.includes(key));
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

async function deleteAppointment(env, id) {
  const result = await env.DB.prepare('DELETE FROM appointments WHERE id = ?').bind(id).run();
  if (result.meta.changes === 0) throw new ApiError('Appointment not found.', 404);
  return new Response(null, { status: 204 });
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