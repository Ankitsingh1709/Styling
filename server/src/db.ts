import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR, DB_PATH } from "./config.js";

fs.mkdirSync(DATA_DIR, { recursive: true });

// Node's built-in SQLite (node:sqlite) — no native build step required. Its API
// mirrors better-sqlite3: db.exec / db.prepare().{run,get,all}.
export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

// Schema is created on boot. Both tables exist now so the data model is stable
// when the outfit mixer (a later phase) starts writing to `outfits`.
db.exec(`
  CREATE TABLE IF NOT EXISTS garments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL CHECK(category IN ('top','bottom','shoes')),
    image_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS outfits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    top_id INTEGER REFERENCES garments(id) ON DELETE SET NULL,
    bottom_id INTEGER REFERENCES garments(id) ON DELETE SET NULL,
    shoes_id INTEGER REFERENCES garments(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Small key/value store for app-wide preferences (e.g. the active AI
  -- provider), so a choice survives a restart.
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Calendar: which saved outfit is worn/planned on a given day (one per date).
  CREATE TABLE IF NOT EXISTS wears (
    date TEXT PRIMARY KEY,             -- YYYY-MM-DD (local)
    outfit_id INTEGER NOT NULL REFERENCES outfits(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

/**
 * Idempotent column adds. `CREATE TABLE IF NOT EXISTS` above is a no-op on a
 * database that already exists, so new columns have to be ALTERed in for
 * everyone who has been running the app.
 */
function addColumnIfMissing(table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// What the garment looks like, as JSON written by the Claude vision pass in
// garmentAnalysis.ts. Null until a garment has been analysed.
addColumnIfMissing("garments", "analysis", "TEXT");
addColumnIfMissing("garments", "analyzed_at", "TEXT");

export interface GarmentRow {
  id: number;
  category: string;
  image_path: string;
  created_at: string;
  analysis: string | null;
  analyzed_at: string | null;
}
