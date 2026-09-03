import { randomUUID } from 'node:crypto';

const sessionColumns = `
  SELECT id, title, created_at AS createdAt, updated_at AS updatedAt
  FROM chat_session
`;

function titleFromPrompt(prompt) {
  const title = String(prompt || '').replace(/\s+/g, ' ').trim();
  if (!title) return 'New chat';
  return title.length > 42 ? `${title.slice(0, 42)}…` : title;
}

function parseImages(value) {
  try {
    const images = JSON.parse(value || '[]');
    return Array.isArray(images) ? images : [];
  } catch {
    return [];
  }
}

export function createChatRepository(db) {
  const ownedSession = db.prepare(`${sessionColumns} WHERE id = ? AND user_id = ?`);
  const list = db.prepare(`${sessionColumns} WHERE user_id = ? ORDER BY updated_at DESC, id DESC`);
  const messages = db.prepare(`
    SELECT id, role, content, images_json AS imagesJson, created_at AS createdAt
    FROM chat_message
    WHERE session_id = ? AND user_id = ?
    ORDER BY id
  `);
  const runs = db.prepare(`
    SELECT id, user_message_id AS userMessageId, assistant_message_id AS assistantMessageId,
      status, step_summary_json AS stepSummaryJson,
      input_tokens AS inputTokens, output_tokens AS outputTokens,
      error, created_at AS createdAt, completed_at AS completedAt
    FROM chat_run
    WHERE session_id = ? AND user_id = ?
    ORDER BY created_at, id
  `);

  const hydrate = (session, userId) => {
    if (!session) return null;
    const sessionRuns = runs.all(session.id, userId).map(({ stepSummaryJson, ...run }) => ({
      ...run,
      stepSummary: parseImages(stepSummaryJson),
    }));
    return {
      ...session,
      messages: messages.all(session.id, userId).map(({ imagesJson, ...message }) => ({
        ...message,
        images: parseImages(imagesJson),
      })),
      runs: sessionRuns,
      latestRun: sessionRuns.at(-1) || null,
    };
  };

  return {
    getModel(userId) {
      return db.prepare('SELECT model FROM chat_preference WHERE user_id = ?').get(userId)?.model || null;
    },
    setModel(userId, model) {
      const value = String(model || '').trim();
      if (!value || value.length > 200) throw new Error('Select a valid model');
      db.prepare(`
        INSERT INTO chat_preference (user_id, model) VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET model = excluded.model, updated_at = CURRENT_TIMESTAMP
      `).run(userId, value);
      return value;
    },
    list(userId) {
      return list.all(userId);
    },
    get(userId, sessionId) {
      return hydrate(ownedSession.get(sessionId, userId), userId);
    },
    create(userId) {
      const id = randomUUID();
      db.prepare('INSERT INTO chat_session (id, user_id) VALUES (?, ?)').run(id, userId);
      return hydrate(ownedSession.get(id, userId), userId);
    },
    remove(userId, sessionId) {
      return db.prepare('DELETE FROM chat_session WHERE id = ? AND user_id = ?').run(sessionId, userId).changes > 0;
    },
    addMessage(userId, sessionId, role, content, images = []) {
      const session = ownedSession.get(sessionId, userId);
      if (!session) throw new Error('Conversation not found');
      const imageMetadata = images.map(({ name, type }) => ({ name, type }));
      const result = db.prepare(`
        INSERT INTO chat_message (session_id, user_id, role, content, images_json)
        VALUES (?, ?, ?, ?, ?)
      `).run(sessionId, userId, role, String(content), JSON.stringify(imageMetadata));
      if (role === 'user' && session.title === 'New chat') {
        db.prepare('UPDATE chat_session SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
          .run(titleFromPrompt(content), sessionId, userId);
      } else {
        db.prepare('UPDATE chat_session SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
          .run(sessionId, userId);
      }
      return result.lastInsertRowid;
    },
    createRun(userId, sessionId, userMessageId = null) {
      if (!ownedSession.get(sessionId, userId)) throw new Error('Conversation not found');
      const id = randomUUID();
      db.prepare('INSERT INTO chat_run (id, session_id, user_id, user_message_id, status) VALUES (?, ?, ?, ?, ?)')
        .run(id, sessionId, userId, userMessageId, 'running');
      return id;
    },
    finishRun(userId, runId, { status, steps, usage = {}, error = null, assistantMessageId = null }) {
      db.prepare(`
        UPDATE chat_run SET status = ?, step_summary_json = ?, input_tokens = ?, output_tokens = ?,
          error = ?, assistant_message_id = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).run(
        status,
        JSON.stringify(steps || []),
        Number(usage.input_tokens || usage.prompt_tokens || 0),
        Number(usage.output_tokens || usage.completion_tokens || 0),
        error,
        assistantMessageId,
        runId,
        userId,
      );
    },
  };
}
