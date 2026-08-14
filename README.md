# Bishop's Schedule — First Draft

A client-only web app for managing the bishop's appointment schedule. Right
now it runs entirely against an in-memory dummy dataset (`DummyApiClient`) so
you can click around and test the whole UI before the Cloudflare Worker /
D1 backend exists.

## Running it

No build step. Just serve the folder statically, e.g.:

```
cd bishop-scheduler
python3 -m http.server 8080
```

Then open `http://localhost:8080`. (Opening `index.html` directly via
`file://` will NOT work — ES modules require a real HTTP origin.)

**Dummy password:** `letmein123`

## What's included in this draft

- Week view (Sun–Sat), but only renders days that either have a configured
  availability window (Sunday, Tuesday evening, Thursday evening in the
  dummy data) or have an actual appointment on them that week.
- Each day column shows only its own time range (its availability window,
  expanded to fit any appointment outside it) — days are different heights,
  but 15 minutes is always the same number of pixels everywhere.
- A permanent **Unscheduled** column pins to the right (scrolls with the
  week, stays visible via `position: sticky`) for appointments with no
  date/time yet. Its "+ Add" button creates one with both left blank.
- Click an empty slot, or the "+ Add Appointment" button, to create an
  appointment. Appointment type auto-fills duration (editable).
- Drag an appointment anywhere — within its day, to a different day, or to
  or from the Unscheduled column. It snaps to the nearest 15-minute mark on
  drop. Tap/click without dragging opens it for editing. Esc cancels the
  edit form and discards changes silently.
- Appointment colors come from `appointment_types.color` (set in the dummy
  seed data / schema, not hardcoded in CSS) — an admin can recolor a type
  without touching code.
- Appointments outside the bishop's normal availability windows get a small
  badge, but are never blocked.
- An appointment with a `directory_link` shows a small icon that opens the
  link in a new tab.
- Overlap prevention: the dummy backend rejects a save/move that collides
  with another appointment on the same day/time, same as the real Worker
  API will. Unscheduled appointments (null date/time) never collide.
- Master-password gate via `sessionStorage`; wrong/missing password
  re-prompts automatically.

## Known simplifications in this first draft

- Re-authentication after a 401 does a full app re-init rather than a
  surgical retry — fine for now, a bit heavier than necessary.
- No loading skeletons/spinners yet — the dummy API has a small simulated
  delay (250ms) so you can see where those would go.
- Dragging within the Unscheduled column doesn't support manual reordering
  — only dragging *out* to a day (or back in) is wired up.

## A deviation worth knowing about

You asked to make `start_time` nullable for unscheduled appointments.
`appointment_date` had to become nullable too — a genuinely unscheduled
appointment (sitting in the sidebar) has no date any more than it has a
time. The unique index on `(appointment_date, start_time)` still works fine
with this: SQLite treats every `NULL` as distinct from every other `NULL`,
so any number of unscheduled appointments can coexist without tripping it.

## Swapping in the real API

Everything is already written against `ApiClient`'s interface
(`get`/`post`/`patch`/`delete`, snake_case JSON matching the D1 schema).
Once the Worker is deployed, open `src/main.js` and replace:

```js
const apiClient = new DummyApiClient({ getPassword: () => authGate.password });
```

with:

```js
import { ApiClient } from './api/ApiClient.js';
const apiClient = new ApiClient({
  baseUrl: 'https://your-worker.your-subdomain.workers.dev/api',
  getPassword: () => authGate.password,
});
```

Nothing else in the app needs to change — repositories, models, and
components were all built against the shared interface, not the dummy data.

## File structure

```
index.html
schema.sql                    reference D1 schema (source of truth)
css/styles.css
src/
  main.js                     entry point / dependency wiring
  api/
    ApiError.js                typed error carrying HTTP status
    ApiClient.js                real fetch-based client (for later)
    DummyApiClient.js           in-memory stand-in used right now
    AuthGate.js                 owns the password gate + sessionStorage
  models/
    Appointment.js
    AppointmentType.js
    AvailabilityWindow.js
  repositories/
    AppointmentRepository.js
    AppointmentTypeRepository.js
    AvailabilityRepository.js
  services/
    AvailabilityCalculator.js   availability/exception-day + per-day bounds (pure)
    DragDropController.js       pixel <-> minute + snap math (pure)
    DragCoordinator.js          cross-column drag orchestration (ghost, drop zones)
  components/
    App.js                      root orchestrator
    WeekNavigator.js
    ScheduleView.js
    DayColumn.js
    UnscheduledColumn.js
    AppointmentBlock.js
    AppointmentForm.js
    PasswordPrompt.js
    Toast.js
  utils/
    DateUtils.js
    helpers.js
```
