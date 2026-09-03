import { fluidConnector, WORKFLOW_EDGE_COLOR } from './workflow-connectors.js';

const NODE_TYPES = [
  ['START', 'Start', '○'],
  ['END', 'End', '◎'],
  ['USER_TASK', 'User task', '◇'],
  ['SERVICE_TASK', 'Service task', '⚙'],
  ['SCRIPT_TASK', 'Script task', '</>'],
  ['EXCLUSIVE_GATEWAY', 'Decision', '×'],
  ['PARALLEL_GATEWAY', 'Parallel', '+'],
  ['TIMER', 'Timer', '◷'],
  ['MESSAGE', 'Message', '✉'],
];

const COLORS = {
  START: '#dcfce7',
  END: '#fee2e2',
  USER_TASK: '#dbeafe',
  SERVICE_TASK: '#ede9fe',
  SCRIPT_TASK: '#f3e8ff',
  EXCLUSIVE_GATEWAY: '#fef3c7',
  PARALLEL_GATEWAY: '#ffedd5',
  TIMER: '#e0f2fe',
  MESSAGE: '#fce7f3',
};

const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );

export function createDefaultWorkflow() {
  return {
    name: 'Untitled workflow',
    key: 'untitled-workflow',
    description: '',
    nodes: [
      { key: 'start', name: 'Start', type: 'START', x: 170, y: 300 },
      { key: 'end', name: 'End', type: 'END', x: 830, y: 300 },
    ],
    edges: [{ from: 'start', to: 'end', condition: '', priority: 0 }],
  };
}

export function createWorkflowDraft(definition) {
  const nodes = (definition.nodes || []).map((node, index) => {
    const config = { ...(node.config || {}) };
    const storedX = Number(config.x), storedY = Number(config.y);
    delete config.x;
    delete config.y;
    return {
      key: node.key,
      name: node.name || node.key,
      type: node.type,
      ...config,
      config,
      x: Number.isFinite(storedX) ? storedX : 140 + (index % 5) * 175,
      y: Number.isFinite(storedY) ? storedY : 150 + Math.floor(index / 5) * 140,
    };
  });
  return {
    name: definition.name || '',
    key: definition.key || '',
    description: definition.description || '',
    nodes,
    edges: (definition.edges || []).map((edge) => ({
      from: edge.from,
      to: edge.to,
      condition: edge.condition || '',
      priority: Number(edge.priority) || 0,
    })),
  };
}

export function validateWorkflowDraft(draft) {
  const errors = [];
  if (!draft.name.trim()) errors.push('Workflow name is required.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.key))
    errors.push('Key must use lowercase letters, numbers, and single hyphens.');
  if (draft.nodes.filter((node) => node.type === 'START').length !== 1)
    errors.push('Add exactly one start node.');
  if (!draft.nodes.some((node) => node.type === 'END')) errors.push('Add at least one end node.');
  const start = draft.nodes.find((node) => node.type === 'START');
  if (start && draft.edges.filter((edge) => edge.from === start.key).length !== 1)
    errors.push('The start node must have exactly one outgoing connection.');
  for (const node of draft.nodes.filter((item) => item.type === 'END')) {
    if (draft.edges.some((edge) => edge.from === node.key)) errors.push(`End node “${node.name}” cannot connect onward.`);
  }
  for (const node of draft.nodes.filter((item) => item.type === 'SERVICE_TASK')) {
    if (!node.workerType?.trim()) errors.push(`Service task “${node.name}” needs a worker type.`);
  }
  const reachable = new Set(start ? [start.key] : []);
  while (start && reachable.size) {
    const size = reachable.size;
    for (const edge of draft.edges) if (reachable.has(edge.from)) reachable.add(edge.to);
    if (reachable.size === size) break;
  }
  for (const node of draft.nodes) {
    if (start && !reachable.has(node.key)) errors.push(`Node “${node.name}” is not connected to the start.`);
  }
  return errors;
}

export function workflowDefinition(draft) {
  return {
    key: draft.key.trim(),
    name: draft.name.trim(),
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    nodes: draft.nodes.map(({ x, y, ...node }) => ({
      ...node,
      config: { ...(node.config || {}), x: Math.round(x), y: Math.round(y) },
    })),
    edges: draft.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      ...(edge.condition.trim() ? { condition: edge.condition.trim() } : {}),
      ...(Number(edge.priority) ? { priority: Number(edge.priority) } : {}),
    })),
  };
}

export class WorkflowEditor {
  constructor(root, options = {}) {
    this.root = root;
    this.onDeploy = options.onDeploy;
    this.onBack = options.onBack;
    this.onLayoutSave = options.onLayoutSave;
    this.mode = options.mode || 'create';
    this.baseVersion = options.baseVersion;
    this.lockKey = Boolean(options.lockKey);
    this.draft = options.draft ? createWorkflowDraft(options.draft) : createDefaultWorkflow();
    this.selected = { kind: 'node', index: 0 };
    this.connectingFrom = null;
    this.drag = null;
    this.submitting = false;
    this.layoutSaveVersion = 0;
    this.layoutSavePromise = Promise.resolve();
    this.render();
  }

  render() {
    this.root.innerHTML = `<section class="workflow-builder">
      <div class="builder-topbar">
        <button class="back-link" type="button" data-editor-back>← All workflows</button>
        <div class="builder-actions"><span class="builder-status" role="status">${this.mode === 'edit' ? `Editing version ${escapeHtml(this.baseVersion)}` : ''}</span><button class="deploy-button" type="button" data-deploy>${this.mode === 'edit' ? 'Deploy new version' : 'Deploy workflow'}</button></div>
      </div>
      <div class="builder-meta">
        <label><span>Name</span><input data-meta="name" value="${escapeHtml(this.draft.name)}" maxlength="120"></label>
        <label><span>Key</span><input data-meta="key" value="${escapeHtml(this.draft.key)}" maxlength="80" ${this.lockKey ? 'readonly aria-readonly="true" title="The key is fixed when creating a new version"' : ''}></label>
        <label class="builder-description"><span>Description</span><input data-meta="description" value="${escapeHtml(this.draft.description)}" maxlength="240" placeholder="What does this workflow do?"></label>
      </div>
      <div class="builder-layout">
        <aside class="builder-palette" aria-label="Workflow nodes"><div><h2>Nodes</h2><p>Click to add to the canvas.</p></div>${NODE_TYPES.map(([type, label, icon]) => `<button type="button" data-add-node="${type}"><i>${escapeHtml(icon)}</i><span>${label}</span></button>`).join('')}</aside>
        <section class="builder-canvas-panel"><div class="canvas-toolbar"><span>${this.draft.nodes.length} nodes · ${this.draft.edges.length} connections</span><span data-layout-status>${this.connectingFrom ? 'Select another node to connect' : this.onLayoutSave ? 'Drag nodes to arrange · Autosave on' : 'Drag nodes to arrange'}</span></div><div class="builder-canvas" data-canvas>${this.svg()}</div></section>
        <aside class="builder-inspector">${this.inspector()}</aside>
      </div>
      <div class="builder-errors" data-errors hidden></div>
    </section>`;
    this.bind();
  }

  svg() {
    const nodeByKey = new Map(this.draft.nodes.map((node) => [node.key, node]));
    const edges = this.draft.edges.map((edge, index) => {
      const from = nodeByKey.get(edge.from), to = nodeByKey.get(edge.to);
      if (!from || !to) return '';
      const { path, labelX, labelY } = fluidConnector(from, to);
      const selected = this.selected?.kind === 'edge' && this.selected.index === index;
      return `<g class="editor-edge${selected ? ' selected' : ''}" data-edge="${index}"><path class="editor-edge-hit" d="${path}"/><path class="editor-edge-line" d="${path}" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#editor-arrow)"/>${edge.condition ? `<text x="${labelX}" y="${labelY}">${escapeHtml(edge.condition)}</text>` : ''}</g>`;
    }).join('');
    const nodes = this.draft.nodes.map((node, index) => {
      const selected = this.selected?.kind === 'node' && this.selected.index === index;
      const icon = NODE_TYPES.find(([type]) => type === node.type)?.[2] || '◇';
      return `<g class="editor-node${selected ? ' selected' : ''}${this.connectingFrom === node.key ? ' connecting' : ''}" data-node="${index}" transform="translate(${node.x} ${node.y})" role="button" tabindex="0"><rect x="-66" y="-38" width="132" height="76" rx="${node.type.includes('GATEWAY') ? 28 : 12}" fill="${COLORS[node.type]}"/><text class="editor-node-icon" y="-10">${escapeHtml(icon)}</text><text class="editor-node-label" y="14">${escapeHtml(node.name.slice(0, 20))}</text><text class="editor-node-type" y="29">${node.type.replaceAll('_', ' ')}</text><circle class="editor-port" data-port="${index}" cx="66" cy="0" r="7"/></g>`;
    }).join('');
    return `<svg class="workflow-editor-svg" viewBox="0 0 1000 600" aria-label="Workflow editor canvas"><defs><pattern id="editor-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#dce5f2"/></pattern><marker id="editor-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="${WORKFLOW_EDGE_COLOR}"/></marker></defs><rect width="1000" height="600" fill="url(#editor-grid)"/>${edges}${nodes}</svg>`;
  }

  inspector() {
    if (!this.selected) return '<div class="inspector-empty"><b>Nothing selected</b><p>Select a node or connection to edit it.</p></div>';
    if (this.selected.kind === 'edge') {
      const edge = this.draft.edges[this.selected.index];
      if (!edge) return '';
      return `<div class="inspector-head"><div><small>CONNECTION</small><h2>${escapeHtml(edge.from)} → ${escapeHtml(edge.to)}</h2></div><button type="button" data-delete title="Delete connection">×</button></div><label><span>Condition</span><input data-edge-field="condition" value="${escapeHtml(edge.condition)}" placeholder="approved == true"></label><label><span>Priority</span><input data-edge-field="priority" type="number" value="${Number(edge.priority) || 0}"></label><p class="inspector-help">Connections with a higher priority are evaluated first.</p>`;
    }
    const node = this.draft.nodes[this.selected.index];
    if (!node) return '';
    const typeLabel = node.type.replaceAll('_', ' ');
    return `<div class="inspector-head"><div><small>${typeLabel}</small><h2>${escapeHtml(node.name)}</h2></div><button type="button" data-delete title="Delete node" ${node.type === 'START' ? 'disabled' : ''}>×</button></div>
      <label><span>Name</span><input data-node-field="name" value="${escapeHtml(node.name)}"></label>
      <label><span>Key</span><input data-node-field="key" value="${escapeHtml(node.key)}"></label>
      ${this.typeFields(node)}
      <button class="connect-button${this.connectingFrom === node.key ? ' active' : ''}" type="button" data-connect>${this.connectingFrom === node.key ? 'Cancel connection' : 'Connect to another node'} <span>→</span></button>
      <p class="inspector-help">Choose connect, then select the destination node.</p>`;
  }

  typeFields(node) {
    if (node.type === 'USER_TASK') return `${this.field('assignee', node.assignee, 'Assignee', 'person@example.com')}${this.field('candidateGroup', node.candidateGroup, 'Candidate group', 'managers')}`;
    if (node.type === 'SERVICE_TASK' || node.type === 'SCRIPT_TASK') return `${this.field('workerType', node.workerType, 'Worker type', node.type === 'SCRIPT_TASK' ? 'script.run' : 'email.send')}${this.field('retries', node.retries ?? 3, 'Retries', '', 'number')}`;
    if (node.type === 'TIMER') return this.field('durationMs', node.durationMs ?? 60000, 'Duration (milliseconds)', '', 'number');
    if (node.type === 'MESSAGE') return this.field('messageName', node.messageName, 'Message name', 'payment-received');
    return '';
  }

  field(name, value, label, placeholder = '', type = 'text') {
    return `<label><span>${label}</span><input data-node-field="${name}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"></label>`;
  }

  bind() {
    this.root.querySelector('[data-editor-back]').onclick = () => this.onBack?.();
    this.root.querySelectorAll('[data-meta]').forEach((input) => {
      input.oninput = () => { this.draft[input.dataset.meta] = input.value; };
    });
    this.root.querySelectorAll('[data-add-node]').forEach((button) => {
      button.onclick = () => this.addNode(button.dataset.addNode);
    });
    this.root.querySelector('[data-deploy]').onclick = () => this.deploy();
    this.root.querySelector('[data-delete]')?.addEventListener('click', () => this.removeSelected());
    this.root.querySelector('[data-connect]')?.addEventListener('click', () => {
      const node = this.draft.nodes[this.selected.index];
      this.connectingFrom = this.connectingFrom === node.key ? null : node.key;
      this.render();
    });
    this.root.querySelectorAll('[data-node-field]').forEach((input) => {
      input.onchange = () => this.updateNode(input.dataset.nodeField, input.value, input.type);
    });
    this.root.querySelectorAll('[data-edge-field]').forEach((input) => {
      input.onchange = () => {
        this.draft.edges[this.selected.index][input.dataset.edgeField] = input.type === 'number' ? Number(input.value) : input.value;
        this.render();
      };
    });
    const svg = this.root.querySelector('svg');
    svg.querySelectorAll('[data-edge]').forEach((edge) => {
      edge.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        this.selected = { kind: 'edge', index: Number(edge.dataset.edge) };
        this.render();
      });
    });
    svg.querySelectorAll('[data-node]').forEach((element) => {
      element.addEventListener('pointerdown', (event) => this.nodePointerDown(event, element, svg));
      element.addEventListener('click', () => {
        if (this.connectingFrom) return;
        const index = Number(element.dataset.node);
        this.selected = { kind: 'node', index };
        this.render();
      });
      element.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.selectNode(Number(element.dataset.node));
      });
    });
    svg.addEventListener('pointermove', (event) => this.nodePointerMove(event, svg));
    svg.addEventListener('pointerup', () => this.finishDrag());
    svg.addEventListener('pointercancel', () => this.finishDrag());
    svg.addEventListener('pointerdown', (event) => {
      if (event.target === svg || event.target.tagName === 'rect' && !event.target.closest('[data-node]')) {
        this.selected = null;
        this.render();
      }
    });
  }

  addNode(type) {
    if (type === 'START' && this.draft.nodes.some((node) => node.type === 'START')) return this.showErrors(['A workflow can only have one start node.']);
    const base = type.toLowerCase().replaceAll('_', '-');
    let key = base, suffix = 2;
    while (this.draft.nodes.some((node) => node.key === key)) key = `${base}-${suffix++}`;
    const count = this.draft.nodes.length;
    const node = { key, name: NODE_TYPES.find(([value]) => value === type)[1], type, x: 250 + (count * 145) % 600, y: 170 + (Math.floor(count / 4) % 3) * 135 };
    if (type === 'SERVICE_TASK') node.workerType = '';
    if (type === 'SERVICE_TASK' || type === 'SCRIPT_TASK') node.retries = 3;
    if (type === 'TIMER') node.durationMs = 60000;
    const directEdge = this.draft.edges.findIndex((edge) => edge.from === 'start' && edge.to === 'end');
    if (type !== 'END' && directEdge !== -1 && this.draft.nodes.length === 2) {
      this.draft.edges.splice(directEdge, 1, { from: 'start', to: key, condition: '', priority: 0 }, { from: key, to: 'end', condition: '', priority: 0 });
    }
    this.draft.nodes.push(node);
    this.selected = { kind: 'node', index: this.draft.nodes.length - 1 };
    this.render();
  }

  selectNode(index) {
    const node = this.draft.nodes[index];
    if (this.connectingFrom && this.connectingFrom !== node.key) {
      const duplicate = this.draft.edges.some((edge) => edge.from === this.connectingFrom && edge.to === node.key);
      const source = this.draft.nodes.find((item) => item.key === this.connectingFrom);
      if (!duplicate && source?.type !== 'END') this.draft.edges.push({ from: this.connectingFrom, to: node.key, condition: '', priority: 0 });
      this.connectingFrom = null;
    }
    this.selected = { kind: 'node', index };
    this.render();
  }

  nodePointerDown(event, element, svg) {
    event.stopPropagation();
    const index = Number(element.dataset.node);
    if (event.target.matches('[data-port]')) {
      this.selected = { kind: 'node', index };
      this.connectingFrom = this.draft.nodes[index].key;
      this.render();
      return;
    }
    if (this.connectingFrom) return this.selectNode(index);
    this.selected = { kind: 'node', index };
    const point = this.svgPoint(event, svg);
    const node = this.draft.nodes[index];
    this.drag = { index, dx: point.x - node.x, dy: point.y - node.y, moved: false };
    element.setPointerCapture?.(event.pointerId);
  }

  nodePointerMove(event, svg) {
    if (!this.drag) return;
    this.drag.moved = true;
    const point = this.svgPoint(event, svg), node = this.draft.nodes[this.drag.index];
    node.x = Math.max(80, Math.min(920, point.x - this.drag.dx));
    node.y = Math.max(55, Math.min(545, point.y - this.drag.dy));
    const group = svg.querySelector(`[data-node="${this.drag.index}"]`);
    group?.setAttribute('transform', `translate(${node.x} ${node.y})`);
    this.refreshEdges(svg);
  }

  finishDrag() {
    const moved = this.drag?.moved;
    this.drag = null;
    if (moved) this.saveLayout();
  }

  saveLayout() {
    if (!this.onLayoutSave) return;
    const version = ++this.layoutSaveVersion;
    const nodes = this.draft.nodes.map(({ key, x, y }) => ({ key, x: Math.round(x), y: Math.round(y) }));
    this.setLayoutStatus('Saving layout…');
    this.layoutSavePromise = this.layoutSavePromise
      .catch(() => {})
      .then(() => this.onLayoutSave(nodes))
      .then(() => {
        if (version === this.layoutSaveVersion) this.setLayoutStatus('Layout saved');
      })
      .catch((error) => {
        if (version === this.layoutSaveVersion) this.setLayoutStatus(`Autosave failed: ${error.message}`);
      });
  }

  setLayoutStatus(message) {
    const status = this.root.querySelector('[data-layout-status]');
    if (status) status.textContent = message;
  }

  refreshEdges(svg) {
    const nodeByKey = new Map(this.draft.nodes.map((node) => [node.key, node]));
    this.draft.edges.forEach((edge, index) => {
      const from = nodeByKey.get(edge.from), to = nodeByKey.get(edge.to);
      const { path } = fluidConnector(from, to);
      svg.querySelectorAll(`[data-edge="${index}"] path`).forEach((item) => item.setAttribute('d', path));
    });
  }

  svgPoint(event, svg) {
    const point = svg.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
  }

  updateNode(field, value, inputType) {
    const node = this.draft.nodes[this.selected.index];
    if (field === 'key') {
      const next = value.trim();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(next) || this.draft.nodes.some((item) => item !== node && item.key === next))
        return this.showErrors(['Node keys must be unique and use lowercase letters, numbers, and single hyphens.']);
      this.draft.edges.forEach((edge) => {
        if (edge.from === node.key) edge.from = next;
        if (edge.to === node.key) edge.to = next;
      });
      if (this.connectingFrom === node.key) this.connectingFrom = next;
    }
    node[field] = inputType === 'number' ? Number(value) : value;
    this.render();
  }

  removeSelected() {
    if (this.selected?.kind === 'edge') this.draft.edges.splice(this.selected.index, 1);
    else if (this.selected?.kind === 'node') {
      const node = this.draft.nodes[this.selected.index];
      if (node.type === 'START') return;
      this.draft.nodes.splice(this.selected.index, 1);
      this.draft.edges = this.draft.edges.filter((edge) => edge.from !== node.key && edge.to !== node.key);
    }
    this.selected = null;
    this.render();
  }

  showErrors(errors) {
    const target = this.root.querySelector('[data-errors]');
    if (!target) return;
    target.hidden = false;
    target.innerHTML = `<b>Check the workflow</b><ul>${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul>`;
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async deploy() {
    const errors = validateWorkflowDraft(this.draft);
    if (errors.length) return this.showErrors(errors);
    const button = this.root.querySelector('[data-deploy]');
    const status = this.root.querySelector('.builder-status');
    button.disabled = true; status.textContent = 'Deploying…';
    try {
      await this.onDeploy(workflowDefinition(this.draft));
    } catch (error) {
      button.disabled = false; status.textContent = '';
      this.showErrors([error.message]);
    }
  }

  destroy() {
    this.drag = null;
  }
}
