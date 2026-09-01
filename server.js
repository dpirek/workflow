import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { openDatabase } from './workflow/database/database.js';
import { createUser, findUserByEmail, migrateLegacyUsers } from './workflow/database/users.js';
import { WorkflowEngine } from './workflow/engine/workflow-engine.js';

const root = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(root, 'public');
const usersPath = resolve(process.env.USERS_PATH || 'db/users.json');
const database = openDatabase();
migrateLegacyUsers(database, usersPath);
const engine = new WorkflowEngine(database);
const sessions = new Map();
const secret = process.env.AUTH_SECRET || 'change-this-secret-in-production';
const json = (res, status, value, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(value));
};
const body = async (req) => {
  let text = '';
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : {};
};
const sessionToken = (user) => {
  const value = `${user.id}.${randomBytes(18).toString('hex')}`;
  return `${value}.${createHmac('sha256', secret).update(value).digest('hex')}`;
};
function currentUser(req) {
  const raw = (req.headers.cookie || '')
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('workflow_session='))
    ?.split('=')[1];
  return (raw && sessions.get(raw)) || null;
}
function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) json(res, 401, { error: 'Authentication required' });
  return user;
}
function safePath(urlPath) {
  const file = normalize(join(publicRoot, urlPath === '/' ? 'index.html' : urlPath));
  return file.startsWith(publicRoot) ? file : null;
}
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;
  try {
    if (path === '/health' && req.method === 'GET') return json(res, 200, { status: 'ok', service: 'flowboard' });
    if (path === '/api/auth' && req.method === 'GET') return json(res, 200, { user: currentUser(req) });
    if (path === '/api/auth/register' && req.method === 'POST') {
      const { name, email, password } = await body(req);
      const normalized = String(email || '')
        .trim()
        .toLowerCase();
      if (!name || !normalized || !password || password.length < 8)
        return json(res, 400, { error: 'Name, email, and a password of at least 8 characters are required' });
      if (findUserByEmail(database, normalized))
        return json(res, 409, { error: 'An account with that email already exists' });
      const salt = randomBytes(16).toString('hex');
      const userData = {
        id: randomBytes(8).toString('hex'),
        name: String(name).trim(),
        email: normalized,
        role: 'user',
        salt,
        hash: scryptSync(password, salt, 64).toString('hex'),
        createdAt: new Date().toISOString(),
      };
      createUser(database, userData);
      const session = sessionToken(userData);
      const safe = { id: userData.id, name: userData.name, email: userData.email, role: userData.role };
      sessions.set(session, safe);
      return json(
        res,
        201,
        { user: safe },
        { 'set-cookie': `workflow_session=${session}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800` },
      );
    }
    if (path === '/api/auth/login' && req.method === 'POST') {
      const { email, password } = await body(req);
      const found = findUserByEmail(database, email);
      const hash = found && scryptSync(password || '', found.salt, 64);
      if (!found || !timingSafeEqual(Buffer.from(found.hash, 'hex'), hash))
        return json(res, 401, { error: 'Invalid email or password' });
      const session = sessionToken(found);
      const safe = { id: found.id, name: found.name, email: found.email, role: found.role };
      sessions.set(session, safe);
      return json(
        res,
        200,
        { user: safe },
        { 'set-cookie': `workflow_session=${session}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800` },
      );
    }
    if (path === '/api/auth/logout' && req.method === 'POST') {
      const raw = (req.headers.cookie || '')
        .split(';')
        .map((x) => x.trim())
        .find((x) => x.startsWith('workflow_session='))
        ?.split('=')[1];
      if (raw) sessions.delete(raw);
      return json(res, 200, { ok: true }, { 'set-cookie': 'workflow_session=; HttpOnly; Path=/; Max-Age=0' });
    }
    if (path.startsWith('/api/')) {
      if (!requireUser(req, res)) return;
      if (path === '/api/workflows' && req.method === 'GET')
        return json(res, 200, { workflows: engine.listDefinitions().map((item) => engine.getDefinition(item.id)) });
      if (path === '/api/workflows' && req.method === 'POST')
        return json(res, 201, { workflow: engine.deploy((await body(req)).definition) });
      if (path === '/api/instances' && req.method === 'GET')
        return json(res, 200, { instances: engine.listProcessInstances({ limit: 100 }) });
      if (path === '/api/instances' && req.method === 'POST') {
        const input = await body(req);
        return json(res, 201, {
          instance: engine.startProcess(input.processKey, input.variables || {}, { businessKey: input.businessKey }),
        });
      }
      if (path === '/api/tasks' && req.method === 'GET')
        return json(res, 200, { tasks: engine.listTasks({ limit: 100 }) });
      if (path === '/api/jobs' && req.method === 'GET') {
        const rows = engine.db
          .prepare(
            'SELECT id, process_instance_id AS processInstanceId, node_id AS nodeId, job_type AS type, status, payload_json, retries, due_at AS dueAt, locked_by AS lockedBy, locked_until AS lockedUntil, last_error AS lastError, created_at AS createdAt, completed_at AS completedAt FROM job ORDER BY id DESC LIMIT 500',
          )
          .all();
        return json(res, 200, {
          jobs: rows.map((row) => ({ ...row, payload: JSON.parse(row.payload_json || '{}'), payload_json: undefined })),
        });
      }
      if (path === '/api/incidents' && req.method === 'GET')
        return json(res, 200, { incidents: engine.listIncidents({ limit: 100 }) });
      const processMatch = path.match(/^\/api\/processes\/(\d+)(?:\/(history|variables))?$/);
      if (processMatch && req.method === 'GET') {
        const id = Number(processMatch[1]);
        if (processMatch[2] === 'history') return json(res, 200, { history: engine.getHistory(id) });
        if (processMatch[2] === 'variables')
          return json(res, 200, { variables: engine.getProcessInstance(id).variables });
        return json(res, 200, { process: engine.getProcessInstance(id) });
      }
      const taskAction = path.match(/^\/api\/tasks\/(\d+)\/(claim|complete)$/);
      if (taskAction && req.method === 'POST') {
        const input = await body(req);
        const result =
          taskAction[2] === 'claim'
            ? engine.claimTask(Number(taskAction[1]), input.assignee || user.email)
            : engine.completeTask(Number(taskAction[1]), input.variables || {});
        return json(res, 200, { task: result });
      }
      const jobAction = path.match(/^\/api\/jobs\/(\d+)\/retry$/);
      if (jobAction && req.method === 'POST')
        return json(res, 200, { job: engine.retryJob(Number(jobAction[1]), 3, 0) });
      const incidentAction = path.match(/^\/api\/incidents\/(\d+)\/resolve$/);
      if (incidentAction && req.method === 'POST')
        return json(res, 200, {
          incident: engine.resolveIncident(Number(incidentAction[1]), {
            retryJob: Boolean((await body(req)).retryJob),
          }),
        });
      return json(res, 404, { error: 'API route not found' });
    }
    if (req.method === 'GET') {
      const file = safePath(path);
      if (file && existsSync(file)) {
        res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
        return res.end(readFileSync(file));
      }
      // Client-side routes all use the same SPA entry point.
      if (!path.includes('.')) {
        res.writeHead(200, { 'content-type': types['.html'] });
        return res.end(readFileSync(join(publicRoot, 'index.html')));
      }
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    json(res, 400, { error: error.message });
  }
});
const port = Number(process.env.PORT || 8080);
server.listen(port, () => console.log(`Workflow web app listening on http://127.0.0.1:${port}`));
process.on('SIGTERM', () => {
  engine.close();
  server.close();
});
process.on('SIGINT', () => {
  engine.close();
  server.close();
});
