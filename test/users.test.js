import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../workflow/database/database.js';
import { createUser, findUserByEmail, migrateLegacyUsers } from '../workflow/database/users.js';

test('imports legacy JSON users into SQLite only once', () => {
  const directory = mkdtempSync(join(tmpdir(), 'workflow-users-'));
  const legacyPath = join(directory, 'users.json');
  const db = openDatabase(':memory:');
  writeFileSync(
    legacyPath,
    JSON.stringify([
      {
        id: 'legacy-user',
        name: 'Legacy User',
        email: 'LEGACY@example.com',
        role: 'user',
        salt: 'salt',
        hash: 'hash',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]),
  );

  try {
    assert.equal(migrateLegacyUsers(db, legacyPath), 1);
    assert.equal(migrateLegacyUsers(db, legacyPath), 0);
    assert.equal(findUserByEmail(db, 'legacy@example.com').name, 'Legacy User');
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('creates and retrieves users from SQLite', () => {
  const db = openDatabase(':memory:');
  try {
    createUser(db, {
      id: 'new-user',
      name: 'New User',
      email: 'new@example.com',
      role: 'user',
      salt: 'salt',
      hash: 'hash',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    assert.equal(findUserByEmail(db, 'NEW@example.com').id, 'new-user');
  } finally {
    db.close();
  }
});
