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
    CREATE TABLE IF NOT EXISTS app_user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      role TEXT NOT NULL DEFAULT 'user',
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS app_migration (
      name TEXT PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS chat_session (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'New chat',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS chat_message (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES chat_session(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      images_json TEXT NOT NULL DEFAULT '[]',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS chat_run (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_session(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed', 'cancelled')),
      step_summary_json TEXT NOT NULL DEFAULT '[]',
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_definition_key_status
      ON process_definition(process_key, status, version DESC);
    CREATE INDEX IF NOT EXISTS idx_edge_source_priority
      ON process_edge(source_node_id, priority DESC, id ASC);
    CREATE INDEX IF NOT EXISTS idx_incident_status
      ON incident(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_session_user_updated
      ON chat_session(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_message_session_user
      ON chat_message(session_id, user_id, id);
    CREATE INDEX IF NOT EXISTS idx_chat_run_session_user
      ON chat_run(session_id, user_id, created_at DESC);
    CREATE TRIGGER IF NOT EXISTS chat_message_owner_guard
      BEFORE INSERT ON chat_message
      WHEN NOT EXISTS (
        SELECT 1 FROM chat_session WHERE id = NEW.session_id AND user_id = NEW.user_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'chat message user must own session');
      END;
    CREATE TRIGGER IF NOT EXISTS chat_run_owner_guard
      BEFORE INSERT ON chat_run
      WHEN NOT EXISTS (
        SELECT 1 FROM chat_session WHERE id = NEW.session_id AND user_id = NEW.user_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'chat run user must own session');
      END;
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
