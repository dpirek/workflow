import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const SCHEMA_PATH = fileURLToPath(new URL('../../db/schema.sql', import.meta.url));

export function openDatabase(path = process.env.WORKFLOW_DB_PATH || resolve('db/workflow.db')) {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });

  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');

  const initialized = db
    .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'process_definition'")
    .get();
  if (!initialized) db.exec(readFileSync(SCHEMA_PATH, 'utf8'));

  // Additive, idempotent runtime indexes. The supplied schema remains the source of truth.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_definition_key_status
      ON process_definition(process_key, status, version DESC);
    CREATE INDEX IF NOT EXISTS idx_edge_source_priority
      ON process_edge(source_node_id, priority DESC, id ASC);
    CREATE INDEX IF NOT EXISTS idx_incident_status
      ON incident(status, created_at);
  `);
  return db;
}

export function withTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = fn();
    db.exec('COMMIT');
    return value;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Preserve the original transition error.
    }
    throw error;
  }
}
