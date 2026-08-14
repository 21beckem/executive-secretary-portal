-- Bishop's Schedule — D1 schema reference
-- Mirrors the shape DummyApiClient.js simulates. Deploy this via
-- `wrangler d1 execute <db-name> --file=schema.sql` once the Worker exists.

CREATE TABLE appointment_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  default_duration_minutes INTEGER NOT NULL,
  color TEXT NOT NULL DEFAULT '#6E7480' -- hex color, admin-editable, drives the block's UI color
);

CREATE TABLE availability_windows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_of_week INTEGER NOT NULL,   -- 0 = Sunday ... 6 = Saturday
  start_time TEXT NOT NULL,       -- 'HH:MM'
  end_time TEXT NOT NULL,
  label TEXT
);

CREATE TABLE appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_name TEXT NOT NULL,
  appointment_type_id INTEGER NOT NULL REFERENCES appointment_types(id),
  duration_minutes INTEGER NOT NULL,
  appointment_date TEXT,                    -- 'YYYY-MM-DD'; NULL = unscheduled
  start_time TEXT,                          -- 'HH:MM'; NULL = unscheduled
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  directory_link TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_status ON appointments(status);

-- SQLite unique indexes treat every NULL as distinct from every other NULL,
-- so any number of unscheduled appointments (both columns NULL) can coexist
-- without tripping this constraint — it only guards real date/time slots.
CREATE UNIQUE INDEX idx_appointments_date_time ON appointments(appointment_date, start_time);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'exec_secretary',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed data
INSERT INTO appointment_types (name, default_duration_minutes, color) VALUES
  ('Bishop Chat', 30, '#3B5BA5'),
  ('Temple Recommend', 15, '#4F8F6B'),
  ('Living Ordinance Recommend', 60, '#7C5CA8'),
  ('Endorsement', 15, '#C97B4A'),
  ('Tithing Declaration', 15, '#3F9C93'),
  ('Calling', 15, '#B08D57'),
  ('Other', 30, '#6E7480');
