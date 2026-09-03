import assert from 'node:assert/strict';
import test from 'node:test';
import { openDatabase } from '../workflow/database/database.js';
import { createChatRepository } from '../workflow/database/chat.js';
import { createUser } from '../workflow/database/users.js';

const user = (id, email) => ({
  id, name: id, email, role: 'user', salt: 'salt', hash: 'hash', createdAt: new Date().toISOString(),
});

test('chat sessions, messages, and run summaries are isolated by user', () => {
  const db = openDatabase(':memory:');
  createUser(db, user('user-a', 'a@example.com'));
  createUser(db, user('user-b', 'b@example.com'));
  const chats = createChatRepository(db);
  const session = chats.create('user-a');
  chats.addMessage('user-a', session.id, 'user', 'List my workflows');
  const runId = chats.createRun('user-a', session.id);
  chats.finishRun('user-a', runId, {
    status: 'completed',
    steps: [{ id: 'one', label: 'workflow.list_workflows', status: 'completed' }],
    usage: { input_tokens: 11, output_tokens: 7 },
  });

  assert.equal(chats.list('user-b').length, 0);
  assert.equal(chats.get('user-b', session.id), null);
  assert.throws(() => chats.addMessage('user-b', session.id, 'user', 'Unauthorized'), /not found/);
  assert.equal(chats.remove('user-b', session.id), false);
  assert.throws(() => db.prepare(`
    INSERT INTO chat_message (session_id, user_id, role, content) VALUES (?, ?, 'user', 'bypass')
  `).run(session.id, 'user-b'), /must own session/);
  const loaded = chats.get('user-a', session.id);
  assert.equal(loaded.messages[0].content, 'List my workflows');
  assert.equal(loaded.latestRun.stepSummary[0].label, 'workflow.list_workflows');
  assert.equal(loaded.latestRun.inputTokens, 11);
  db.close();
});
