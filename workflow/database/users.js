import { existsSync, readFileSync } from 'node:fs';

export function migrateLegacyUsers(db, path) {
  if (!path || !existsSync(path)) return 0;
  if (db.prepare("SELECT 1 FROM app_migration WHERE name = 'legacy_users_json'").get()) return 0;

  const users = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(users)) throw new Error('Legacy users file must contain an array');

  const insert = db.prepare(`
    INSERT OR IGNORE INTO app_user
      (id, name, email, role, password_salt, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  let imported = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const user of users) {
      if (!user.id || !user.name || !user.email || !user.salt || !user.hash) continue;
      const result = insert.run(
        user.id,
        user.name,
        String(user.email).trim().toLowerCase(),
        user.role || 'user',
        user.salt,
        user.hash,
        user.createdAt || new Date().toISOString(),
      );
      imported += Number(result.changes);
    }
    db.prepare("INSERT INTO app_migration (name) VALUES ('legacy_users_json')").run();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return imported;
}

export function findUserByEmail(db, email) {
  return db
    .prepare(
      `
      SELECT id, name, email, role,
        password_salt AS salt,
        password_hash AS hash,
        created_at AS createdAt
      FROM app_user
      WHERE email = ? COLLATE NOCASE
    `,
    )
    .get(
      String(email || '')
        .trim()
        .toLowerCase(),
    );
}

export function createUser(db, user) {
  db.prepare(
    `
    INSERT INTO app_user
      (id, name, email, role, password_salt, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(user.id, user.name, user.email, user.role, user.salt, user.hash, user.createdAt);
  return user;
}
