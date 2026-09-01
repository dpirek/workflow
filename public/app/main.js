import Router from './router.js';
import { mountWorkflowCharts } from './components/workflow-chart.js';

const app = document.querySelector('#app'),
  router = new Router();
let state = {
  user: null,
  view: 'overview',
  workflowId: null,
  workflows: [],
  instances: [],
  tasks: [],
  jobs: [],
  incidents: [],
};
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
  app.innerHTML = `<div class="shell"><aside><div class="brand">✦<b>Flowboard</b></div><p class="eyebrow">OPERATIONS</p><nav>${menu.map(([id, label]) => `<button class="nav ${state.view === id || (id === 'workflows' && state.view === 'workflow-detail') ? 'active' : ''}" data-path="/${id}">${label}</button>`).join('')}</nav><div class="profile"><i>${esc(state.user.name[0])}</i><span><b>${esc(state.user.name)}</b><small>${esc(state.user.email)}</small></span><button id="logout">↗</button></div></aside><main class="content"><header><div><p class="eyebrow">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p><h1>${pageTitle()}</h1></div><button id="refresh" class="refresh" aria-label="Refresh">↻</button></header>${page()}</main></div>`;
  document.querySelectorAll('[data-path]').forEach((b) => (b.onclick = () => router.navigate(b.dataset.path)));
  document.querySelector('#refresh').onclick = load;
  document.querySelector('#logout').onclick = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    state.user = null;
    router.navigate('/login');
  };
  if (state.view === 'workflow-detail') workflowCharts = mountWorkflowCharts(app, state.workflows);
}

function page() {
  if (state.view === 'workflows')
    return workflowList();
  if (state.view === 'workflow-detail') return workflowDetail();
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

function pageTitle() {
  if (state.view !== 'workflow-detail') return state.view[0].toUpperCase() + state.view.slice(1);
  return esc(state.workflows.find((workflow) => String(workflow.id) === state.workflowId)?.name || 'Workflow');
}

function workflowList() {
  if (!state.workflows.length) return '<section class="panel empty">No workflows deployed yet.</section>';
  return `<section class="panel workflow-list"><div class="panel-head"><div><h2>Workflow definitions</h2><p class="muted">Select a workflow to inspect its definition.</p></div><em>${state.workflows.length}</em></div>${state.workflows
    .map((workflow) => {
      const running = state.instances.filter(
        (instance) => instance.processKey === workflow.key && instance.status === 'RUNNING',
      ).length;
      return `<button class="workflow-list-item" data-path="/workflows/${encodeURIComponent(workflow.id)}"><span class="workflow-list-icon">◇</span><span class="workflow-list-name"><b>${esc(workflow.name)}</b><small>${esc(workflow.key)} · version ${workflow.version}</small></span><span class="workflow-list-meta"><small>${workflow.nodes?.length || 0} nodes</small><small>${running} running</small></span><label class="status">${esc(workflow.status)}</label><span class="workflow-list-arrow">→</span></button>`;
    })
    .join('')}</section>`;
}

function workflowDetail() {
  const workflow = state.workflows.find((item) => String(item.id) === state.workflowId);
  if (!workflow) {
    return `<section class="panel workflow-not-found"><h2>Workflow not found</h2><p class="muted">This definition may have been removed.</p><button class="secondary" data-path="/workflows">← Back to workflows</button></section>`;
  }

  const instances = state.instances.filter((instance) => instance.processKey === workflow.key);
  const running = instances.filter((instance) => instance.status === 'RUNNING').length;
  return `<button class="back-link" data-path="/workflows">← All workflows</button><section class="workflow-detail-summary"><div><span class="workflow-list-icon">◇</span><div><p class="eyebrow">${esc(workflow.key)}</p><h2>${esc(workflow.name)}</h2><p class="muted">Version ${workflow.version}</p></div></div><label class="status">${esc(workflow.status)}</label></section><section class="workflow-detail-stats"><div><small>NODES</small><strong>${workflow.nodes?.length || 0}</strong></div><div><small>CONNECTIONS</small><strong>${workflow.edges?.length || 0}</strong></div><div><small>RUNNING</small><strong>${running}</strong></div><div><small>INSTANCES</small><strong>${instances.length}</strong></div></section><section class="panel workflow-diagram"><div class="panel-head"><div><h2>Definition</h2><p class="muted">Workflow nodes and transitions.</p></div></div><div class="graph-wrap" data-workflow-chart="${workflow.id}"></div></section>`;
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
    state.workflowId = null;
    render();
  })
  .addRoute('/workflows/:id', ({ params }) => {
    state.view = 'workflow-detail';
    state.workflowId = params.id;
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
