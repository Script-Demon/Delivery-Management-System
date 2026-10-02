import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('customer','agent','admin')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  vehicle_type TEXT NOT NULL DEFAULT 'motorbike' CHECK (vehicle_type IN ('bicycle','motorbike','car','van')),
  availability TEXT NOT NULL DEFAULT 'offline' CHECK (availability IN ('online','offline')),
  lat          REAL,
  lng          REAL,
  location_at  TEXT
);

CREATE TABLE IF NOT EXISTS addresses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  line        TEXT NOT NULL,
  city        TEXT NOT NULL,
  notes       TEXT,
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  is_default  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT UNIQUE,
  customer_id     INTEGER NOT NULL REFERENCES users(id),
  agent_id        INTEGER REFERENCES users(id),
  package_type    TEXT NOT NULL CHECK (package_type IN ('food','parcel','product')),
  description     TEXT NOT NULL,
  weight_kg       REAL NOT NULL DEFAULT 1,
  priority        TEXT NOT NULL DEFAULT 'standard' CHECK (priority IN ('standard','express')),
  pickup_label    TEXT NOT NULL,
  pickup_line     TEXT NOT NULL,
  pickup_lat      REAL NOT NULL,
  pickup_lng      REAL NOT NULL,
  dropoff_label   TEXT NOT NULL,
  dropoff_line    TEXT NOT NULL,
  dropoff_lat     REAL NOT NULL,
  dropoff_lng     REAL NOT NULL,
  recipient_name  TEXT NOT NULL,
  recipient_phone TEXT,
  distance_km     REAL NOT NULL,
  fee             REAL NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  rating          INTEGER CHECK (rating BETWEEN 1 AND 5),
  feedback        TEXT,
  created_at      TEXT NOT NULL,
  assigned_at     TEXT,
  picked_up_at    TEXT,
  delivered_at    TEXT,
  closed_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_agent ON orders(agent_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  note       TEXT,
  actor_id   INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_order ON order_events(order_id);

CREATE TABLE IF NOT EXISTS location_pings (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id  INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  agent_id  INTEGER NOT NULL REFERENCES users(id),
  lat       REAL NOT NULL,
  lng       REAL NOT NULL,
  at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pings_order ON location_pings(order_id);
`;

export function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

/** Run fn inside a transaction; rolls back if it throws. */
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const now = () => new Date().toISOString();
