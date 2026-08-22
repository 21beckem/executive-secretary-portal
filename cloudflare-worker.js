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
  briefTags: [
    'label',
    'color',
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

  // Briefs Tags
  if (path === '/briefs/tags' && method === 'GET') {
    return BriefsTagHelpers.getTags(env);
  }
  if (path === '/briefs/tags' && method === 'POST') {
    return BriefsTagHelpers.createTag(env, await parseJson(request));
  }

  // Briefs
  if (path === '/briefs/briefs' && method === 'POST') {
    return BriefHelpers.createBrief(env, await parseJson(request));
  }
  if (path === '/briefs/briefs' && method === 'GET') {
    return BriefHelpers.queryBriefs(env, searchParams);
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

  // Briefs Tags
  const briefTagsIdMatch = path.match(/^\/briefs\/tags\/(\d+)$/);
  if (briefTagsIdMatch && method === 'PATCH') {
    return BriefsTagHelpers.updateTag(env, Number(briefTagsIdMatch[1]), await parseJson(request));
  }
  if (briefTagsIdMatch && method === 'DELETE') {
    return BriefsTagHelpers.deleteTag(env, Number(briefTagsIdMatch[1]));
  }

  // Briefs
  const briefsIdMatch = path.match(/^\/briefs\/briefs\/(\d+)$/);
  if (briefsIdMatch && method === 'GET') {
    return BriefHelpers.getBrief(env, Number(briefsIdMatch[1]));
  }
  if (briefsIdMatch && method === 'PATCH') {
    return BriefHelpers.updateBrief(env, Number(briefsIdMatch[1]), await parseJson(request));
  }
  if (briefsIdMatch && method === 'DELETE') {
    return BriefHelpers.deleteBrief(env, Number(briefsIdMatch[1]));
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

class BriefsTagHelpers {
  static async getTags(env) {
    const { results } = await env.DB.prepare(
      'SELECT * FROM brief_tags'
    ).all();
    return jsonResponse(results);
  }
  
  static async createTag(env, body) {
    if (!body.label) throw new ApiError('date is required.', 400);
  
    try {
      const row = await runReturningOne(
        env,
        `INSERT INTO brief_tags
          (label, color)
        VALUES (?, ?)
        RETURNING *`,
        [
          body.label,
          body.color ?? null,
        ]
      );
      return jsonResponse(row);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ApiError('A with that label already exists.', 409);
      }
      throw err;
    }
  }
  
  static async updateTag(env, id, body) {
    const fields = Object.keys(body).filter((key) => PATCHABLE_FIELDS.briefTags.includes(key));
    if (fields.length === 0) throw new ApiError('No updatable fields provided.', 400);
  
    const setClause = fields.map((field) => `${field} = ?`).join(', ');
    const values = fields.map((field) => body[field] ?? null);
  
    try {
      const row = await runReturningOne(
        env,
        `UPDATE brief_tags SET ${setClause} WHERE id = ? RETURNING *`,
        [...values, id]
      );
      if (!row) throw new ApiError('Tag not found.', 404);
      return jsonResponse(row);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (isUniqueConstraintError(err)) {
        throw new ApiError('A tag with that label already exists.', 409);
      }
      throw err;
    }
  }
  
  static async deleteTag(env, id) {
    const result = await env.DB.prepare('DELETE FROM brief_tags WHERE id = ?').bind(id).run();
    if (result.meta.changes === 0) throw new ApiError('Tag not found.', 404);
    return jsonResponse({ success: true });
  }
}

class BriefHelpers {
  // ---- internal: recursively walk a brief's blocks, collecting
  // tag ids, type ids, and run text for indexing ----
  static _walkBlocks(blocks, acc) {
    if (!Array.isArray(blocks)) return;
    for (const block of blocks) {
      if (Array.isArray(block.tagIds)) {
        for (const t of block.tagIds) acc.tagIds.add(t);
      }
      if (block.type && block.type.typeId != null) {
        acc.typeIds.add(String(block.type.typeId));
      }
      if (block.text && Array.isArray(block.text.runs)) {
        for (const run of block.text.runs) {
          if (run.text) acc.texts.push(run.text);
        }
      }
      if (Array.isArray(block.children) && block.children.length) {
        BriefHelpers._walkBlocks(block.children, acc);
      }
    }
  }

  static _extractIndexData(name, topLevelTagIds, blocks) {
    const acc = { tagIds: new Set(), typeIds: new Set(), texts: [] };
    if (Array.isArray(topLevelTagIds)) {
      for (const t of topLevelTagIds) acc.tagIds.add(t);
    }
    BriefHelpers._walkBlocks(blocks, acc);
    const bodyText = acc.texts.join(' ').trim();
    const searchText = [name ?? '', bodyText].filter(Boolean).join(' ').trim();
    return { tagIds: [...acc.tagIds], typeIds: [...acc.typeIds], searchText, bodyText };
  }

  // ---- internal: fully replace derived index rows for a brief ----
  static async _syncIndexes(env, briefId, name, tagIds, typeIds, bodyText) {
    const stmts = [
      env.DB.prepare('DELETE FROM brief_tag_index WHERE brief_id = ?').bind(briefId),
      env.DB.prepare('DELETE FROM brief_type_index WHERE brief_id = ?').bind(briefId),
      env.DB.prepare('DELETE FROM brief_search_index WHERE rowid = ?').bind(briefId),
    ];

    for (const tagId of tagIds) {
      stmts.push(
        env.DB.prepare('INSERT OR IGNORE INTO brief_tag_index (brief_id, tag_id) VALUES (?, ?)').bind(briefId, tagId)
      );
    }
    for (const typeId of typeIds) {
      stmts.push(
        env.DB.prepare('INSERT OR IGNORE INTO brief_type_index (brief_id, type_id) VALUES (?, ?)').bind(briefId, typeId)
      );
    }
    stmts.push(
      env.DB.prepare('INSERT INTO brief_search_index (rowid, name, body_text) VALUES (?, ?, ?)').bind(
        briefId,
        name ?? '',
        bodyText
      )
    );

    await env.DB.batch(stmts);
  }

  static _rowToBrief(row) {
    const stored = JSON.parse(row.content);
    return {
      id: row.id,
      name: row.name,
      date: row.date,
      tagIds: stored.tagIds ?? [],
      content: stored.content ?? [],
    };
  }

  static _escapeLike(str) {
    return str.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  }

  static _toFtsQuery(q) {
    // AND'd prefix terms, e.g. "budget rev" -> budget* AND rev*
    return q
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `${term.replace(/"/g, '')}*`)
      .join(' AND ');
  }

  static async createBrief(env, body) {
    requireFields(body, ['date', 'content']);

    const now = new Date().toISOString();
    const tagIds = Array.isArray(body.tagIds) ? body.tagIds : [];
    const blocks = Array.isArray(body.content) ? body.content : [];

    const { tagIds: flatTagIds, typeIds, searchText, bodyText } = BriefHelpers._extractIndexData(
      body.name,
      tagIds,
      blocks
    );
    const storedContent = JSON.stringify({ tagIds, content: blocks });

    const row = await runReturningOne(
      env,
      `INSERT INTO briefs (name, date, content, search_text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [body.name ?? null, body.date, storedContent, searchText, now, now]
    );

    await BriefHelpers._syncIndexes(env, row.id, body.name ?? null, flatTagIds, typeIds, bodyText);

    return jsonResponse(BriefHelpers._rowToBrief(row), 201);
  }

  static async updateBrief(env, id, body) {
    const existing = await env.DB.prepare('SELECT * FROM briefs WHERE id = ?').bind(id).first();
    if (!existing) throw new ApiError('Brief not found.', 404);

    const existingParsed = JSON.parse(existing.content);

    const name = 'name' in body ? body.name : existing.name;
    const date = 'date' in body ? body.date : existing.date;
    const tagIds = 'tagIds' in body
      ? (Array.isArray(body.tagIds) ? body.tagIds : [])
      : (existingParsed.tagIds ?? []);
    const blocks = 'content' in body
      ? (Array.isArray(body.content) ? body.content : [])
      : (existingParsed.content ?? []);

    const { tagIds: flatTagIds, typeIds, searchText, bodyText } = BriefHelpers._extractIndexData(
      name,
      tagIds,
      blocks
    );
    const storedContent = JSON.stringify({ tagIds, content: blocks });

    const row = await runReturningOne(
      env,
      `UPDATE briefs SET name = ?, date = ?, content = ?, search_text = ?, updated_at = ? WHERE id = ? RETURNING *`,
      [name ?? null, date, storedContent, searchText, new Date().toISOString(), id]
    );

    await BriefHelpers._syncIndexes(env, id, name ?? null, flatTagIds, typeIds, bodyText);

    return jsonResponse(BriefHelpers._rowToBrief(row));
  }

  static async deleteBrief(env, id) {
    // brief_tag_index / brief_type_index cascade via FK.
    // FTS5 has no FK support, so clean it up explicitly in the same batch.
    const results = await env.DB.batch([
      env.DB.prepare('DELETE FROM brief_search_index WHERE rowid = ?').bind(id),
      env.DB.prepare('DELETE FROM briefs WHERE id = ?').bind(id),
    ]);
    if (results[1].meta.changes === 0) throw new ApiError('Brief not found.', 404);
    return new Response(null, { status: 204 });
  }

  static async getBrief(env, id) {
    const row = await env.DB.prepare('SELECT * FROM briefs WHERE id = ?').bind(id).first();
    if (!row) throw new ApiError('Brief not found.', 404);
    return jsonResponse(BriefHelpers._rowToBrief(row));
  }

  static async queryBriefs(env, searchParams) {
    const q = searchParams.get('q');
    const tagsParam = searchParams.get('tags');
    const typesParam = searchParams.get('types');
    const pageIndex = Math.max(0, parseInt(searchParams.get('pageIndex') ?? '0', 10) || 0);
    const pageLength = Math.max(1, parseInt(searchParams.get('pageLength') ?? '20', 10) || 20);
    const sortDirection = searchParams.get('sortDirection') === 'asc' ? 'ASC' : 'DESC';
    const searchMode = searchParams.get('search-mode') === 'exact' ? 'exact' : 'like';

    const tagIds = tagsParam ? tagsParam.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const typeIds = typesParam ? typesParam.split(',').map((s) => s.trim()).filter(Boolean) : [];

    const conditions = [];
    const bindings = [];

    if (q) {
      if (searchMode === 'exact') {
        conditions.push('b.id IN (SELECT rowid FROM brief_search_index WHERE brief_search_index MATCH ?)');
        bindings.push(BriefHelpers._toFtsQuery(q));
      } else {
        conditions.push(`b.search_text LIKE ? ESCAPE '\\'`);
        bindings.push(`%${BriefHelpers._escapeLike(q)}%`);
      }
    }

    // OR semantics: a brief matches if it has ANY of the given tag/type ids.
    // To require ALL of them instead, swap this block for a
    // GROUP BY brief_id HAVING COUNT(DISTINCT tag_id) = ? pattern.
    if (tagIds.length) {
      const placeholders = tagIds.map(() => '?').join(', ');
      conditions.push(`b.id IN (SELECT brief_id FROM brief_tag_index WHERE tag_id IN (${placeholders}))`);
      bindings.push(...tagIds);
    }

    if (typeIds.length) {
      const placeholders = typeIds.map(() => '?').join(', ');
      conditions.push(`b.id IN (SELECT brief_id FROM brief_type_index WHERE type_id IN (${placeholders}))`);
      bindings.push(...typeIds);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = await env.DB.prepare(`SELECT COUNT(*) as total FROM briefs b ${whereClause}`)
      .bind(...bindings)
      .first();

    const { results } = await env.DB.prepare(
      `SELECT b.* FROM briefs b ${whereClause}
       ORDER BY b.date ${sortDirection}, b.id ${sortDirection}
       LIMIT ? OFFSET ?`
    )
      .bind(...bindings, pageLength, pageIndex * pageLength)
      .all();

    return jsonResponse({
      results: results.map((row) => BriefHelpers._rowToBrief(row)),
      pageIndex,
      pageLength,
      total: countRow?.total ?? 0,
    });
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