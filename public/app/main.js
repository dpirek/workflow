import Router from './router.js';
import { chatPage } from './components/chat-page.js';
import { requestProgressGraphic } from './components/request-progress.js';
import { mountWorkflowCharts } from './components/workflow-chart.js';
import { WorkflowEditor } from './components/workflow-editor.js';

const app = document.querySelector('#app'),
  router = new Router();
let state = {
  user: null,
  sidebarCollapsed: localStorage.getItem('flow.sidebar.collapsed') === 'true',
  view: 'overview',
  workflowId: null,
  selectedNodeKey: null,
  selectedRequestId: null,
  selectedTaskId: null,
  workflows: [],
  instances: [],
  tasks: [],
  jobs: [],
  incidents: [],
  chatSessions: [],
  activeChat: null,
  chatRunning: false,
  chatImages: [],
  chatController: null,
  promptHistory: [],
};
let workflowCharts = [];
let workflowEditor = null;
document.addEventListener('keydown', (event) => {
  if (
    event.key !== 'Escape' ||
    (!state.selectedNodeKey && state.selectedRequestId === null && state.selectedTaskId === null)
  )
    return;
  state.selectedNodeKey = null;
  state.selectedRequestId = null;
  state.selectedTaskId = null;
  render();
});
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
const uiIcon = (name) => `<img src="/icons/${name}.svg" alt="" aria-hidden="true">`;

function auth(mode = 'login', error = '') {
  app.innerHTML = `<main class="auth"><section><div class="brand">✦ <b>Flow</b></div><p class="eyebrow">WORKFLOW OPERATIONS</p><h1>${mode === 'login' ? 'Welcome back.' : 'Create your workspace.'}</h1><p class="muted">${mode === 'login' ? 'Sign in to manage your workflows.' : 'Build and run durable workflows.'}</p>${error ? `<div class="error">${esc(error)}</div>` : ''}<form id="form">${mode === 'register' ? '<label>Full name<input name="name" required></label>' : ''}<label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" minlength="8" required></label><button class="primary">${mode === 'login' ? 'Sign in' : 'Create account'} <span>→</span></button></form><button class="link" id="switch">${mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button></section></main>`;
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
  const [w, i, t, j, n, c] = await Promise.all([
    api('/api/workflows'),
    api('/api/instances'),
    api('/api/tasks'),
    api('/api/jobs'),
    api('/api/incidents'),
    api('/api/chat/sessions'),
  ]);
  Object.assign(state, {
    workflows: w.workflows,
    instances: i.instances,
    tasks: t.tasks,
    jobs: j.jobs,
    incidents: n.incidents,
    chatSessions: c.sessions,
  });
  if (state.activeChat && !c.sessions.some((session) => session.id === state.activeChat.id)) state.activeChat = null;
  if (window.location.pathname === '/chat' && !state.activeChat && state.chatSessions.length) {
    await loadChatSession(state.chatSessions[0].id);
  }
  router.render();
}

function render() {
  workflowCharts.forEach((chart) => chart.destroy());
  workflowCharts = [];
  workflowEditor?.destroy();
  workflowEditor = null;
  const menu = [
    ['overview', 'Overview'],
    ['chat', 'Chat'],
    ['workflows', 'Workflows'],
    ['requests', 'Requests'],
    ['tasks', 'Tasks'],
  ];
  const isEditor = ['workflow-new', 'workflow-edit'].includes(state.view);
  const isChat = state.view === 'chat';
  app.innerHTML = `<div class="shell${state.sidebarCollapsed ? ' sidebar-collapsed' : ''}"><aside><div class="sidebar-head"><button class="brand sidebar-brand" type="button" aria-label="Flow${state.sidebarCollapsed ? ' — expand navigation' : ''}" title="${state.sidebarCollapsed ? 'Expand navigation' : 'Flow'}"><span class="brand-mark">✦</span><b>Flow</b></button><button class="sidebar-toggle" type="button" aria-expanded="${!state.sidebarCollapsed}" aria-label="Collapse navigation" title="Collapse navigation"><img src="/sidebar-toggle.svg" alt=""></button></div><p class="eyebrow">OPERATIONS</p><nav>${menu.map(([id, label]) => `<button class="nav ${state.view === id || (id === 'workflows' && ['workflow-detail', 'workflow-new', 'workflow-edit'].includes(state.view)) ? 'active' : ''}" data-path="/${id}" aria-label="${label}" title="${label}">${label}</button>`).join('')}</nav><div class="profile"><i>${esc(state.user.name[0])}</i><span><b>${esc(state.user.name)}</b><small>${esc(state.user.email)}</small></span><button id="logout" aria-label="Sign out" title="Sign out">↗</button></div></aside><main class="content${isEditor ? ' editor-content' : ''}${isChat ? ' chat-content' : ''}">${isChat ? page() : `<header><div><p class="eyebrow">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p><h1>${pageTitle()}</h1></div>${isEditor ? '' : '<button id="refresh" class="refresh" aria-label="Refresh">↻</button>'}</header>${page()}`}</main></div>`;
  const setSidebarCollapsed = (collapsed) => {
    state.sidebarCollapsed = collapsed;
    localStorage.setItem('flow.sidebar.collapsed', String(state.sidebarCollapsed));
    const shell = document.querySelector('.shell');
    const toggle = document.querySelector('.sidebar-toggle');
    const brand = document.querySelector('.sidebar-brand');
    shell.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
    toggle.setAttribute('aria-expanded', String(!state.sidebarCollapsed));
    brand.setAttribute('aria-label', `Flow${state.sidebarCollapsed ? ' — expand navigation' : ''}`);
    brand.title = state.sidebarCollapsed ? 'Expand navigation' : 'Flow';
  };
  document.querySelector('.sidebar-toggle').onclick = () => setSidebarCollapsed(true);
  document.querySelector('.sidebar-brand').onclick = () => {
    if (state.sidebarCollapsed) setSidebarCollapsed(false);
  };
  document.querySelectorAll('[data-path]').forEach((b) => (b.onclick = () => router.navigate(b.dataset.path)));
  document.querySelector('#refresh')?.addEventListener('click', load);
  document.querySelector('#logout').onclick = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    state.user = null;
    router.navigate('/login');
  };
  if (isChat) bindChat();
  document.querySelectorAll('[data-close-node]').forEach((element) => {
    element.onclick = (event) => {
      if (event.target !== element && !element.matches('button')) return;
      state.selectedNodeKey = null;
      render();
    };
  });
  document.querySelectorAll('[data-close-detail]').forEach((element) => {
    element.onclick = (event) => {
      if (event.target !== element && !element.matches('button')) return;
      state.selectedRequestId = null;
      state.selectedTaskId = null;
      render();
    };
  });
  document.querySelectorAll('[data-request-id]').forEach((element) => {
    element.onclick = () => {
      state.selectedRequestId = Number(element.dataset.requestId);
      render();
    };
  });
  document.querySelectorAll('[data-task-id]').forEach((element) => {
    element.onclick = () => {
      state.selectedTaskId = Number(element.dataset.taskId);
      render();
    };
  });
  document.querySelectorAll('[data-assign-task]').forEach((form) => {
    form.onsubmit = async (event) => {
      event.preventDefault();
      const button = form.querySelector('button');
      const error = form.querySelector('.assignment-error');
      button.disabled = true;
      error.textContent = '';
      try {
        await api(`/api/tasks/${form.dataset.assignTask}/claim`, {
          method: 'POST',
          body: JSON.stringify({ assignee: new FormData(form).get('assignee') }),
        });
        await load();
      } catch (requestError) {
        error.textContent = requestError.message;
        button.disabled = false;
      }
    };
  });
  if (state.view === 'workflow-detail') {
    workflowCharts = mountWorkflowCharts(app, state.workflows, {
      onNodeSelect(nodeKey) {
        state.selectedNodeKey = nodeKey;
        render();
      },
    });
  }
  if (isEditor) {
    const existing = state.view === 'workflow-edit'
      ? state.workflows.find((item) => String(item.id) === state.workflowId)
      : null;
    if (state.view === 'workflow-edit' && !existing) return;
    workflowEditor = new WorkflowEditor(document.querySelector('[data-workflow-editor]'), {
      mode: existing ? 'edit' : 'create',
      draft: existing,
      baseVersion: existing?.version,
      lockKey: Boolean(existing),
      onBack() {
        router.navigate(existing ? `/workflows/${existing.id}` : '/workflows');
      },
      onLayoutSave: existing
        ? async (nodes) => {
            const { workflow } = await api(`/api/workflows/${existing.id}/layout`, {
              method: 'PATCH',
              body: JSON.stringify({ nodes }),
            });
            const index = state.workflows.findIndex((item) => String(item.id) === String(existing.id));
            if (index !== -1) state.workflows[index] = workflow;
          }
        : null,
      async onDeploy(definition) {
        const { workflow } = await api('/api/workflows', {
          method: 'POST',
          body: JSON.stringify({ definition }),
        });
        await load();
        router.navigate(`/workflows/${workflow.id}`);
      },
    });
  }
}

function page() {
  if (state.view === 'chat') return chatPage({
    sessions: state.chatSessions,
    activeSession: state.activeChat,
    running: state.chatRunning,
    draftImages: state.chatImages,
  });
  if (state.view === 'workflows') return workflowList();
  if (state.view === 'workflow-new') return '<div data-workflow-editor></div>';
  if (state.view === 'workflow-edit') {
    const workflow = state.workflows.find((item) => String(item.id) === state.workflowId);
    return workflow
      ? '<div data-workflow-editor></div>'
      : '<section class="panel workflow-not-found"><h2>Workflow not found</h2><p class="muted">This definition may have been removed.</p><button class="secondary" data-path="/workflows">← Back to workflows</button></section>';
  }
  if (state.view === 'workflow-detail') return workflowDetail();
  if (state.view === 'requests') return requestList();
  if (state.view === 'tasks') return taskList();
  return `<section class="stats"><div><small>WORKFLOWS</small><strong>${state.workflows.length}</strong><span>deployed definitions</span></div><div><small>RUNNING REQUESTS</small><strong>${state.instances.filter((i) => i.status === 'RUNNING').length}</strong><span>active executions</span></div><div><small>OPEN TASKS</small><strong>${state.tasks.filter((t) => t.status !== 'COMPLETED').length}</strong><span>awaiting action</span></div></section>${panel(
    'Recent activity',
    state.instances.slice(0, 5).map((i) => [i.processKey, i.businessKey || 'No business key', i.status]),
  )}`;
}

function bindChat() {
  const form = document.querySelector('[data-chat-form]');
  const input = form.querySelector('textarea');
  const send = form.querySelector('.chat-send');
  let historyIndex = state.promptHistory.length;
  const resize = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
    send.disabled = !input.value.trim();
  };
  input.addEventListener('input', resize);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    } else if (!input.value && ['ArrowUp', 'ArrowDown'].includes(event.key) && state.promptHistory.length) {
      event.preventDefault();
      historyIndex = Math.max(0, Math.min(state.promptHistory.length, historyIndex + (event.key === 'ArrowUp' ? -1 : 1)));
      input.value = state.promptHistory[historyIndex] || '';
      resize();
    }
  });
  form.onsubmit = async (event) => {
    event.preventDefault();
    const prompt = input.value.trim();
    if (!prompt) return;
    let session = state.activeChat;
    if (!session) {
      session = (await api('/api/chat/sessions', { method: 'POST', body: '{}' })).session;
      state.activeChat = session;
      state.chatSessions.unshift(session);
    }
    state.promptHistory.push(prompt);
    session.messages.push({ role: 'user', content: prompt, images: state.chatImages.map(({ name, type }) => ({ name, type })) });
    const images = state.chatImages;
    state.chatImages = [];
    state.chatRunning = true;
    state.chatController = new AbortController();
    render();
    scrollChat();
    try {
      const response = await fetch(`/api/chat/sessions/${session.id}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: prompt, images }),
        signal: state.chatController.signal,
      });
      if (!response.ok) {
        const failure = await response.json();
        throw new Error(failure.error || 'Chat request failed');
      }
      await readChatStream(response);
    } catch (error) {
      if (error.name !== 'AbortError') showChatError(error.message);
    } finally {
      state.chatRunning = false;
      state.chatController = null;
      await refreshChat(session.id);
    }
  };
  document.querySelector('[data-chat-stop]')?.addEventListener('click', () => state.chatController?.abort());
  document.querySelector('[data-chat-new]').onclick = async () => {
    if (state.chatRunning) return;
    const { session } = await api('/api/chat/sessions', { method: 'POST', body: '{}' });
    state.chatSessions.unshift(session);
    state.activeChat = session;
    state.chatImages = [];
    render();
  };
  document.querySelectorAll('[data-chat-session]').forEach((button) => {
    button.onclick = async () => {
      if (state.chatRunning) return;
      await refreshChat(button.dataset.chatSession);
    };
  });
  document.querySelectorAll('[data-chat-delete]').forEach((button) => {
    button.onclick = async () => {
      if (state.chatRunning) return;
      await api(`/api/chat/sessions/${button.dataset.chatDelete}`, { method: 'DELETE' });
      state.chatSessions = state.chatSessions.filter(({ id }) => id !== button.dataset.chatDelete);
      if (state.activeChat?.id === button.dataset.chatDelete) state.activeChat = null;
      render();
    };
  });
  const picker = document.querySelector('[data-chat-images]');
  document.querySelector('[data-chat-attach]').onclick = () => picker.click();
  picker.onchange = async () => {
    try {
      const remaining = Math.max(0, 4 - state.chatImages.length);
      const files = [...picker.files].slice(0, remaining);
      state.chatImages.push(...(await Promise.all(files.map(imageFile))));
      render();
    } catch (error) {
      showChatError(error.message);
    }
  };
  document.querySelectorAll('[data-remove-image]').forEach((button) => {
    button.onclick = () => {
      state.chatImages.splice(Number(button.dataset.removeImage), 1);
      render();
    };
  });
  document.querySelector('[data-chat-mic]').onclick = startVoiceInput;
}

async function refreshChat(sessionId) {
  const [{ sessions }, { session }] = await Promise.all([
    api('/api/chat/sessions'),
    api(`/api/chat/sessions/${sessionId}`),
  ]);
  state.chatSessions = sessions;
  setActiveChat(session);
  render();
  scrollChat();
}

async function loadChatSession(sessionId) {
  const { session } = await api(`/api/chat/sessions/${sessionId}`);
  setActiveChat(session);
  return session;
}

function setActiveChat(session) {
  state.activeChat = session;
  state.promptHistory = session.messages.filter(({ role }) => role === 'user').map(({ content }) => content);
}

async function readChatStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) if (line.trim()) applyChatEvent(JSON.parse(line));
  }
  if (buffer.trim()) applyChatEvent(JSON.parse(buffer));
}

function applyChatEvent(event) {
  if (event.type === 'delta') {
    let message = document.querySelector('[data-chat-streaming]');
    if (!message) {
      message = document.createElement('article');
      message.className = 'chat-message assistant';
      message.dataset.chatStreaming = '';
      message.innerHTML = '<div class="chat-avatar">✦</div><div class="chat-bubble"></div>';
      document.querySelector('[data-chat-live]').append(message);
    }
    message.querySelector('.chat-bubble').textContent += event.text;
    scrollChat();
  } else if (event.type === 'step') {
    const details = document.querySelector('.chat-steps');
    if (!details) return;
    let list = details.querySelector('ol');
    let item = list.querySelector(`[data-step-id="${CSS.escape(event.step.id)}"]`);
    if (!item) {
      item = document.createElement('li');
      item.dataset.stepId = event.step.id;
      item.append(document.createElement('span'), document.createElement('div'));
      list.append(item);
    }
    item.className = event.step.status;
    const detail = item.querySelector('div');
    detail.replaceChildren(document.createTextNode(event.step.label));
    if (event.step.error) {
      const error = document.createElement('small');
      error.textContent = event.step.error;
      detail.append(error);
    }
  } else if (event.type === 'error') {
    showChatError(event.error);
  }
}

function showChatError(message) {
  const target = document.querySelector('[data-chat-live]');
  if (!target) return;
  const error = document.createElement('div');
  error.className = 'chat-error';
  error.textContent = message;
  target.append(error);
  scrollChat();
}

function scrollChat() {
  requestAnimationFrame(() => {
    const scroll = document.querySelector('[data-chat-scroll]');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  });
}

function imageFile(file) {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('Only images can be attached'));
  if (file.size > 6_000_000) return Promise.reject(new Error('Each image must be smaller than 6 MB'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: reader.result });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function startVoiceInput() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return showChatError('Voice input is not supported by this browser.');
  const recognition = new Recognition();
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    const input = document.querySelector('[data-chat-form] textarea');
    input.value = `${input.value}${input.value ? ' ' : ''}${event.results[0][0].transcript}`;
    input.dispatchEvent(new Event('input'));
    input.focus();
  };
  recognition.onerror = () => showChatError('Voice input could not be started.');
  recognition.start();
}

function requestList() {
  const rows = state.instances
    .map(
      (request) =>
        `<button class="row detail-row request-row" data-request-id="${request.id}"><span class="dot">${uiIcon('request')}</span><span class="request-name"><b>${esc(request.processName || request.processKey)}</b><small>${esc(request.businessKey || `Request #${request.id}`)}</small></span>${requestProgressGraphic(request.progress)}<label class="status">${esc(request.status)}</label><span class="workflow-list-arrow">→</span></button>`,
    )
    .join('');
  return `<section class="panel"><div class="panel-head"><div><h2>Workflow requests</h2><p class="muted">Select a request to view its details.</p></div><em>${state.instances.length}</em></div>${rows || '<div class="empty">Nothing to show yet.</div>'}</section>${requestDetailDrawer()}`;
}

function taskList() {
  const rows = state.tasks
    .map(
      (task) =>
        `<button class="row detail-row" data-task-id="${task.id}"><span class="dot">${uiIcon('task')}</span><span><b>${esc(task.name)}</b><small>${esc(task.assignee || 'Unassigned')}</small></span><label class="status">${esc(task.status)}</label><span class="workflow-list-arrow">→</span></button>`,
    )
    .join('');
  return `<section class="panel"><div class="panel-head"><div><h2>Human tasks</h2><p class="muted">Select a task to view its details.</p></div><em>${state.tasks.length}</em></div>${rows || '<div class="empty">Nothing to show yet.</div>'}</section>${taskDetailDrawer()}`;
}

function requestDetailDrawer() {
  const request = state.instances.find((item) => item.id === state.selectedRequestId);
  if (!request) return '';
  const tasks = state.tasks.filter((task) => task.processInstanceId === request.id);
  return detailDrawer(
    'Request',
    request.businessKey || `Request #${request.id}`,
    request.status,
    [
      ['Workflow', request.processName || request.processKey],
      ['Process key', request.processKey],
      ['Version', request.version],
      ['Started', formatDate(request.startedAt)],
      ['Ended', formatDate(request.endedAt)],
    ],
    `<section class="drawer-section"><h3>Tasks</h3>${
      tasks.length
        ? tasks
            .map(
              (task) =>
                `<div class="drawer-detail"><span>${esc(task.name)}</span><b>${esc(task.assignee || task.status)}</b></div>`,
            )
            .join('')
        : '<p class="muted">No tasks for this request.</p>'
    }</section>`,
  );
}

function taskDetailDrawer() {
  const task = state.tasks.find((item) => item.id === state.selectedTaskId);
  if (!task) return '';
  const assignment =
    task.status === 'CREATED'
      ? `<section class="drawer-section"><h3>Assignment</h3><form class="drawer-assignment" data-assign-task="${task.id}"><input name="assignee" type="email" value="${esc(state.user.email)}" aria-label="Assignee email" required><button type="submit">Assign</button><small class="assignment-error"></small></form></section>`
      : `<section class="drawer-section"><h3>Assignment</h3><div class="drawer-detail"><span>Assigned to</span><b>${esc(task.assignee || 'Unassigned')}</b></div></section>`;
  return detailDrawer(
    'Human task',
    task.name,
    task.status,
    [
      ['Workflow', task.processKey],
      ['Request', task.businessKey || `#${task.processInstanceId}`],
      ['Node', task.nodeKey],
      ['Priority', task.priority],
      ['Created', formatDate(task.createdAt)],
      ['Due', formatDate(task.dueAt)],
    ],
    assignment,
  );
}

function detailDrawer(type, title, status, details, content = '') {
  return `<div class="node-drawer-backdrop" data-close-detail><aside class="node-drawer" role="dialog" aria-modal="true" aria-label="${esc(title)} details"><button class="drawer-close" data-close-detail aria-label="Close">×</button><p class="eyebrow">${esc(type)}</p><h2>${esc(title)}</h2><p><label class="status">${esc(status)}</label></p><section class="drawer-section"><h3>Details</h3>${details
    .filter(([, value]) => value !== undefined && value !== null && value !== '—')
    .map(([label, value]) => `<div class="drawer-detail"><span>${esc(label)}</span><b>${esc(value)}</b></div>`)
    .join('')}</section>${content}</aside></div>`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function pageTitle() {
  if (state.view === 'workflow-new') return 'Create workflow';
  if (state.view === 'workflow-edit') return 'Edit workflow';
  if (state.view !== 'workflow-detail') return state.view[0].toUpperCase() + state.view.slice(1);
  return esc(state.workflows.find((workflow) => String(workflow.id) === state.workflowId)?.name || 'Workflow');
}

function workflowList() {
  if (!state.workflows.length) return '<section class="panel empty workflow-empty"><p>No workflows deployed yet.</p><button class="deploy-button" data-path="/workflows/new">Create workflow</button></section>';
  return `<section class="workflow-list-actions"><p class="muted">Build and deploy durable process definitions.</p><button class="deploy-button" data-path="/workflows/new">+ New workflow</button></section><section class="panel workflow-list"><div class="panel-head"><div><h2>Workflow definitions</h2><p class="muted">Select a workflow to inspect its definition.</p></div><em>${state.workflows.length}</em></div>${state.workflows
    .map((workflow) => {
      const running = state.instances.filter(
        (instance) => instance.processKey === workflow.key && instance.status === 'RUNNING',
      ).length;
      return `<button class="workflow-list-item" data-path="/workflows/${encodeURIComponent(workflow.id)}"><span class="workflow-list-icon">${uiIcon('workflow')}</span><span class="workflow-list-name"><b>${esc(workflow.name)}</b><small>${esc(workflow.key)} · version ${workflow.version}</small></span><span class="workflow-list-meta"><small>${workflow.nodes?.length || 0} nodes</small><small>${running} running</small></span><label class="status">${esc(workflow.status)}</label><span class="workflow-list-arrow">→</span></button>`;
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
  return `<div class="workflow-detail-actions"><button class="back-link" data-path="/workflows">← All workflows</button><button class="edit-workflow-button" data-path="/workflows/${workflow.id}/edit">Edit workflow</button></div><section class="workflow-detail-summary"><div><span class="workflow-list-icon">${uiIcon('workflow')}</span><div><p class="eyebrow">${esc(workflow.key)}</p><h2>${esc(workflow.name)}</h2><p class="muted">Version ${workflow.version}</p></div></div><label class="status">${esc(workflow.status)}</label></section><section class="workflow-detail-stats"><div><small>NODES</small><strong>${workflow.nodes?.length || 0}</strong></div><div><small>CONNECTIONS</small><strong>${workflow.edges?.length || 0}</strong></div><div><small>RUNNING</small><strong>${running}</strong></div><div><small>REQUESTS</small><strong>${instances.length}</strong></div></section><section class="panel workflow-diagram"><div class="panel-head"><div><h2>Definition</h2><p class="muted">Select any item to view details.</p></div></div><div class="graph-wrap" data-workflow-chart="${workflow.id}"></div></section>${nodeDetailDrawer(workflow)}`;
}

function nodeDetailDrawer(workflow) {
  const node = workflow.nodes?.find((item) => item.key === state.selectedNodeKey);
  if (!node) return '';

  const instanceIds = new Set(
    state.instances
      .filter((instance) => String(instance.processDefinitionId) === String(workflow.id))
      .map((instance) => instance.id),
  );
  const tasks = state.tasks.filter(
    (task) => task.nodeKey === node.key && instanceIds.has(task.processInstanceId) && task.status !== 'COMPLETED',
  );
  const incoming = workflow.edges?.filter((edge) => edge.to === node.key).length || 0;
  const outgoing = workflow.edges?.filter((edge) => edge.from === node.key).length || 0;
  const taskContent =
    node.type === 'USER_TASK'
      ? `<section class="drawer-section"><h3>Assignments</h3>${
          tasks.length
            ? tasks
                .map(
                  (task) =>
                    `<div class="drawer-task"><div><b>${esc(task.name)}</b><small>${esc(task.businessKey || `Request #${task.processInstanceId}`)}</small></div>${
                      task.status === 'CREATED'
                        ? `<form data-assign-task="${task.id}"><input name="assignee" type="email" value="${esc(state.user.email)}" aria-label="Assignee email" required><button type="submit">Assign</button><small class="assignment-error"></small></form>`
                        : `<span><small>Assigned to</small><b>${esc(task.assignee)}</b></span>`
                    }</div>`,
                )
                .join('')
            : '<p class="muted">No active tasks for this item.</p>'
        }</section>`
      : '<section class="drawer-section"><h3>Assignments</h3><p class="muted">Assignments are available for user tasks.</p></section>';

  return `<div class="node-drawer-backdrop" data-close-node><aside class="node-drawer" role="dialog" aria-modal="true" aria-label="${esc(node.name || node.key)} details"><button class="drawer-close" data-close-node aria-label="Close">×</button><p class="eyebrow">${esc(node.type.replaceAll('_', ' '))}</p><h2>${esc(node.name || node.key)}</h2><p class="muted">${esc(node.key)}</p><section class="drawer-properties"><div><small>INCOMING</small><strong>${incoming}</strong></div><div><small>OUTGOING</small><strong>${outgoing}</strong></div><div><small>ACTIVE TASKS</small><strong>${tasks.length}</strong></div></section><section class="drawer-section"><h3>Details</h3>${
    Object.entries(node)
      .filter(([key]) => !['key', 'name', 'type'].includes(key))
      .map(([key, value]) => `<div class="drawer-detail"><span>${esc(key)}</span><b>${esc(value)}</b></div>`)
      .join('') || '<p class="muted">No additional configuration.</p>'
  }</section>${taskContent}</aside></div>`;
}

function panel(title, rows) {
  return `<section class="panel"><div class="panel-head"><div><h2>${title}</h2><p class="muted">Live data from SQLite.</p></div><em>${rows.length}</em></div>${rows.map((r) => `<div class="row"><span class="dot">${uiIcon('activity')}</span><div><b>${esc(r[0])}</b><small>${esc(r[1])}</small></div><label class="status">${esc(r[2])}</label></div>`).join('') || '<div class="empty">Nothing to show yet.</div>'}</section>`;
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
    state.selectedNodeKey = null;
    render();
  })
  .addRoute('/workflows/new', () => {
    state.view = 'workflow-new';
    state.workflowId = null;
    state.selectedNodeKey = null;
    render();
  })
  .addRoute('/workflows/:id/edit', ({ params }) => {
    state.view = 'workflow-edit';
    state.workflowId = params.id;
    state.selectedNodeKey = null;
    render();
  })
  .addRoute('/workflows/:id', ({ params }) => {
    state.view = 'workflow-detail';
    state.workflowId = params.id;
    state.selectedNodeKey = null;
    render();
  })
  .addRoute('/requests', () => {
    state.view = 'requests';
    state.selectedRequestId = null;
    render();
  })
  .addRoute('/instances', () => router.navigate('/requests', { replace: true }))
  .addRoute('/tasks', () => {
    state.view = 'tasks';
    state.selectedTaskId = null;
    render();
  })
  .addRoute('/chat', () => {
    state.view = 'chat';
    if (!state.activeChat && state.chatSessions.length) {
      render();
      loadChatSession(state.chatSessions[0].id).then(() => {
        if (state.view === 'chat') {
          render();
          scrollChat();
        }
      }).catch((error) => showChatError(error.message));
      return;
    }
    render();
    scrollChat();
  })
  .addRoute('/login', () => auth())
  .addRoute('*', () => router.navigate('/overview', { replace: true }));
api('/api/auth')
  .then((d) => (d.user ? ((state.user = d.user), load()) : router.navigate('/login', { replace: true })))
  .catch(() => router.navigate('/login', { replace: true }));
