import Router from './router.js';
import { mountWorkflowCharts } from './components/workflow-chart.js';

const app = document.querySelector('#app'),
  router = new Router();
let state = { user: null, view: 'overview', workflows: [], instances: [], tasks: [], jobs: [], incidents: [] };
let workflowCharts = [];
const api = (p, o = {}) =>
  fetch(p, { headers: { 'content-type': 'application/json' }, ...o }).then(async (r) => {
    const d = await r.json();
    if (!r.ok) throw Error(d.error || 'Request failed');
    return d;
  });
const esc = (s) =>
  String(s || '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

function auth(mode = 'login', error = '') {
  app.innerHTML = `<main class="auth"><section><div class="brand">✦ <b>Flowboard</b></div><p class="eyebrow">WORKFLOW OPERATIONS</p><h1>${mode === 'login' ? 'Welcome back.' : 'Create your workspace.'}</h1><p class="muted">${mode === 'login' ? 'Sign in to manage your workflows.' : 'Build and run durable workflows.'}</p>${error ? `<div class="error">${esc(error)}</div>` : ''}<form id="form">${mode === 'register' ? '<label>Full name<input name="name" required></label>' : ''}<label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" minlength="8" required></label><button class="primary">${mode === 'login' ? 'Sign in' : 'Create account'} <span>→</span></button></form><button class="link" id="switch">${mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button></section></main>`;
  document.querySelector('#switch').onclick = () => auth(mode === 'login' ? 'register' : 'login');
  document.querySelector('#form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      state.user = (
        await api('/api/auth/' + mode, {
          method: 'POST',
          body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
        })
      ).user;
      router.navigate('/overview', { replace: true });
      await load();
    } catch (x) {
      auth(mode, x.message);
    }
  };
}

async function load() {
  const [w, i, t, j, n] = await Promise.all([
    api('/api/workflows'),
    api('/api/instances'),
    api('/api/tasks'),
    api('/api/jobs'),
    api('/api/incidents'),
  ]);
  Object.assign(state, {
    workflows: w.workflows,
    instances: i.instances,
    tasks: t.tasks,
    jobs: j.jobs,
    incidents: n.incidents,
  });
  router.render();
}

function render() {
  workflowCharts.forEach((chart) => chart.destroy());
  workflowCharts = [];
  const menu = [
    ['overview', 'Overview'],
    ['workflows', 'Workflows'],
    ['instances', 'Instances'],
    ['tasks', 'Tasks'],
  ];
  app.innerHTML = `<div class="shell"><aside><div class="brand">✦<b>Flowboard</b></div><p class="eyebrow">OPERATIONS</p><nav>${menu.map(([id, label]) => `<button class="nav ${state.view === id ? 'active' : ''}" data-path="/${id}">${label}</button>`).join('')}</nav><div class="profile"><i>${esc(state.user.name[0])}</i><span><b>${esc(state.user.name)}</b><small>${esc(state.user.email)}</small></span><button id="logout">↗</button></div></aside><main class="content"><header><div><p class="eyebrow">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p><h1>${state.view[0].toUpperCase() + state.view.slice(1)}</h1></div><button id="refresh" class="refresh">↻</button></header>${page()}</main></div>`;
  document.querySelectorAll('[data-path]').forEach((b) => (b.onclick = () => router.navigate(b.dataset.path)));
  document.querySelector('#refresh').onclick = load;
  document.querySelector('#logout').onclick = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    state.user = null;
    router.navigate('/login');
  };
  if (state.view === 'workflows') workflowCharts = mountWorkflowCharts(app, state.workflows);
}

function page() {
  if (state.view === 'workflows')
    return `<div class="workflow-grid">${state.workflows.map((w) => `<section class="panel workflow-card"><div class="panel-head"><div><h2>${esc(w.name)}</h2><p class="muted">${esc(w.key)} · version ${w.version}</p></div><label class="status">${esc(w.status)}</label></div><div class="graph-wrap" data-workflow-chart="${w.id}"></div></section>`).join('') || '<div class="empty">No workflows deployed yet.</div>'}</div>`;
  if (state.view === 'instances')
    return panel(
      'Process instances',
      state.instances.map((i) => [i.processKey, i.businessKey || '—', i.status]),
    );
  if (state.view === 'tasks')
    return panel(
      'Human tasks',
      state.tasks.map((t) => [t.name, t.assignee || 'Unassigned', t.status]),
    );
  return `<section class="stats"><div><small>WORKFLOWS</small><strong>${state.workflows.length}</strong><span>deployed definitions</span></div><div><small>RUNNING INSTANCES</small><strong>${state.instances.filter((i) => i.status === 'RUNNING').length}</strong><span>active executions</span></div><div><small>OPEN TASKS</small><strong>${state.tasks.filter((t) => t.status !== 'COMPLETED').length}</strong><span>awaiting action</span></div></section>${panel(
    'Recent activity',
    state.instances.slice(0, 5).map((i) => [i.processKey, i.businessKey || 'No business key', i.status]),
  )}`;
}
function panel(title, rows) {
  return `<section class="panel"><div class="panel-head"><div><h2>${title}</h2><p class="muted">Live data from SQLite.</p></div><em>${rows.length}</em></div>${rows.map((r) => `<div class="row"><span class="dot">◇</span><div><b>${esc(r[0])}</b><small>${esc(r[1])}</small></div><label class="status">${esc(r[2])}</label></div>`).join('') || '<div class="empty">Nothing to show yet.</div>'}</section>`;
}

router
  .addRoute('/', () => router.navigate('/overview', { replace: true }))
  .addRoute('/overview', () => {
    state.view = 'overview';
    render();
  })
  .addRoute('/workflows', () => {
    state.view = 'workflows';
    render();
  })
  .addRoute('/instances', () => {
    state.view = 'instances';
    render();
  })
  .addRoute('/tasks', () => {
    state.view = 'tasks';
    render();
  })
  .addRoute('/login', () => auth())
  .addRoute('*', () => router.navigate('/overview', { replace: true }));
api('/api/auth')
  .then((d) => (d.user ? ((state.user = d.user), load()) : router.navigate('/login', { replace: true })))
  .catch(() => router.navigate('/login', { replace: true }));
