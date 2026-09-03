import {
  allocateConnectorSides,
  fluidConnector,
  WORKFLOW_EDGE_COLOR,
  WORKFLOW_NODE_HEIGHT,
  WORKFLOW_NODE_WIDTH,
} from './workflow-connectors.js';

const COLORS = {
  START: '#dff7e9',
  END: '#eef1f5',
  USER_TASK: '#e7f2ff',
  SERVICE_TASK: '#f0e7ff',
  SCRIPT_TASK: '#f0e7ff',
  EXCLUSIVE_GATEWAY: '#fff3d9',
  PARALLEL_GATEWAY: '#fff3d9',
  TIMER: '#e7f2ff',
  MESSAGE: '#e7f2ff',
};
const STROKES = {
  START: '#42b878',
  END: '#8795aa',
  USER_TASK: '#4b91ed',
  SERVICE_TASK: '#9163df',
  SCRIPT_TASK: '#9163df',
  EXCLUSIVE_GATEWAY: '#eea52d',
  PARALLEL_GATEWAY: '#eea52d',
  TIMER: '#4b91ed',
  MESSAGE: '#4b91ed',
};
const NODE_WIDTH = WORKFLOW_NODE_WIDTH;
const NODE_HEIGHT = WORKFLOW_NODE_HEIGHT;
const COLUMN_SPACING = 190;
const escapeXml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

const ICON_PATHS = {
  START: '<circle cx="0" cy="0" r="7"/><path d="m-2.5-4 6 4-6 4Z"/>',
  END: '<circle cx="0" cy="0" r="7"/><rect x="-3" y="-3" width="6" height="6" rx="1"/>',
  USER_TASK:
    '<circle cx="0" cy="-3.5" r="3"/><path d="M-6 7c.5-4 2.5-6 6-6s5.5 2 6 6M-3 7v-2M3 7v-2"/>',
  SERVICE_TASK:
    '<circle cx="0" cy="0" r="2.5"/><path d="M0-8v3M0 5v3M-8 0h3M5 0h3M-5.7-5.7l2.2 2.2M3.5 3.5l2.2 2.2M5.7-5.7 3.5-3.5M-3.5 3.5l-2.2 2.2"/>',
  SCRIPT_TASK: '<path d="m-5-4-4 4 4 4M5-4l4 4-4 4M2-7-4 14"/>',
  EXCLUSIVE_GATEWAY: '<path d="M0-8 8 0 0 8-8 0Z"/><path d="m-3-3 6 6M3-3l-6 6"/>',
  PARALLEL_GATEWAY: '<path d="M0-8 8 0 0 8-8 0Z"/><path d="M0-4v8M-4 0h8"/>',
  TIMER: '<circle cx="0" cy="0" r="8"/><path d="M0-4v5l3 2"/>',
  MESSAGE: '<rect x="-9" y="-6" width="18" height="12" rx="2"/><path d="m-8-4 8 6 8-6"/>',
};

function nodeIcon(type, x, y) {
  const paths = ICON_PATHS[type] || '<circle cx="0" cy="0" r="6"/><path d="M-3 0h6"/>';
  return `<g class="chart-node-icon" transform="translate(${x} ${y})" fill="none" stroke="${STROKES[type] || '#8795aa'}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`;
}

export function routeConnector(a, b, sides) {
  return fluidConnector(a, b, NODE_WIDTH, NODE_HEIGHT, sides);
}

export class WorkflowChart {
  constructor(container, definition, options = {}) {
    this.container = container;
    this.definition = definition;
    this.onNodeSelect = options.onNodeSelect;
    this.width = null;
    this.frame = null;
    this.resize = (entries) => {
      const width = Math.floor(entries?.[0]?.contentRect?.width || this.container.clientWidth || 0);
      if (!width || width === this.width || this.frame !== null) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        this.render();
      });
    };
    if (typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(this.resize);
      this.observer.observe(container);
    } else window.addEventListener('resize', this.resize);
    this.render();
  }

  layout(width) {
    const nodes = this.definition.nodes || [],
      edges = this.definition.edges || [];
    const hasSavedLayout = nodes.length > 0 && nodes.every(
      (node) => node.config && Number.isFinite(Number(node.config.x)) && Number.isFinite(Number(node.config.y)),
    );
    if (hasSavedLayout) {
      return {
        width: Math.max(width, 1000),
        height: 600,
        nodeWidth: NODE_WIDTH,
        positions: new Map(nodes.map((node) => [node.key, { x: Number(node.config.x), y: Number(node.config.y) }])),
        edges,
        nodes,
        manual: true,
      };
    }
    const incoming = new Map(nodes.map((n) => [n.key, []]));
    const outgoing = new Map(nodes.map((n) => [n.key, []]));
    edges.forEach((e) => {
      incoming.get(e.to)?.push(e);
      outgoing.get(e.from)?.push(e);
    });
    const rank = new Map();
    const queue = nodes.filter((n) => !incoming.get(n.key)?.length).map((n) => n.key);
    queue.forEach((key) => rank.set(key, 0));

    let nextUnranked = 0;
    while (rank.size < nodes.length) {
      if (!queue.length) {
        while (nextUnranked < nodes.length && rank.has(nodes[nextUnranked].key)) nextUnranked += 1;
        if (nextUnranked < nodes.length) {
          const key = nodes[nextUnranked].key;
          rank.set(key, Math.max(0, ...rank.values()) + 1);
          queue.push(key);
        }
      }

      while (queue.length) {
        const key = queue.shift();
        for (const edge of outgoing.get(key) || []) {
          if (rank.has(edge.to)) continue;
          rank.set(edge.to, rank.get(key) + 1);
          queue.push(edge.to);
        }
      }
    }
    const columns = new Map();
    nodes.forEach((n) => {
      const r = rank.get(n.key);
      if (!columns.has(r)) columns.set(r, []);
      columns.get(r).push(n);
    });
    const ranks = [...columns.keys()].sort((a, b) => a - b);
    const pad = 34;
    const nodeWidth = NODE_WIDTH;
    const columnSpacing = COLUMN_SPACING;
    const layoutWidth = Math.max(width, pad * 2 + nodeWidth + Math.max(0, ranks.length - 1) * columnSpacing);
    const gapX = ranks.length > 1 ? (layoutWidth - pad * 2 - nodeWidth) / (ranks.length - 1) : 0;
    const maxRows = Math.max(1, ...[...columns.values()].map((list) => list.length));
    const height = Math.max(220, maxRows * 112 + 76);
    const positions = new Map();
    ranks.forEach((r, ci) => {
      const list = columns.get(r);
      const gapY = height / (list.length + 1);
      list.forEach((node, ri) => positions.set(node.key, { x: pad + nodeWidth / 2 + ci * gapX, y: gapY * (ri + 1) }));
    });
    return { width: layoutWidth, height, nodeWidth, positions, edges, nodes, manual: false };
  }

  render() {
    const measuredWidth = Math.floor(this.container.clientWidth || 800);
    this.width = measuredWidth;
    const width = Math.max(480, measuredWidth);
    const { width: layoutWidth, height, nodeWidth, positions, edges, nodes } = this.layout(width);
    const nodeHeight = NODE_HEIGHT;
    const marker = `arrow-${this.definition.id}`;
    const connectorSides = allocateConnectorSides(positions, edges);
    const edgeSvg = edges
      .map((edge, index) => {
        const a = positions.get(edge.from),
          b = positions.get(edge.to);
        if (!a || !b) return '';
        const { path } = routeConnector(a, b, connectorSides[index]);
        return `<g class="chart-edge" data-edge-index="${index}" tabindex="0"><path class="chart-edge-hit" d="${path}" fill="none" stroke="transparent" stroke-width="16"/><path class="chart-edge-line" d="${path}" fill="none" stroke="${WORKFLOW_EDGE_COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#${marker})"/></g>`;
      })
      .join('');
    const edgeDescriptionSvg = edges
      .map((edge, index) => {
        if (!edge.condition) return '';
        const a = positions.get(edge.from),
          b = positions.get(edge.to);
        if (!a || !b) return '';
        const { labelX: x, labelY: y } = routeConnector(a, b, connectorSides[index]),
          bubbleWidth = Math.max(64, Math.min(520, String(edge.condition).length * 6.5 + 32));
        return `<g class="chart-edge-description" data-edge-description="${index}" transform="translate(${x} ${y})"><rect x="${-bubbleWidth / 2}" y="-19" width="${bubbleWidth}" height="30" rx="7"/><text y="1">${escapeXml(edge.condition)}</text></g>`;
      })
      .join('');
    const nodeSvg = nodes
      .map((node) => {
        const p = positions.get(node.key),
          radius = node.type.includes('GATEWAY') ? 30 : 10;
        return `<g class="chart-node chart-${node.type.toLowerCase()}" data-node-key="${escapeXml(node.key)}" role="button" tabindex="0" aria-label="View ${escapeXml(node.name || node.key)} details"><rect x="${p.x - nodeWidth / 2}" y="${p.y - nodeHeight / 2}" width="${nodeWidth}" height="${nodeHeight}" rx="${radius}" fill="${COLORS[node.type] || '#eef1f5'}" stroke="${STROKES[node.type] || '#8795aa'}"/>${nodeIcon(node.type, p.x, p.y - 20)}<text class="chart-type" x="${p.x}" y="${p.y + 1}">${escapeXml(node.type.replaceAll('_', ' '))}</text><text class="chart-label" x="${p.x}" y="${p.y + 20}">${escapeXml((node.name || node.key).slice(0, 22))}</text></g>`;
      })
      .join('');
    this.container.innerHTML = `<svg class="workflow-svg" width="${layoutWidth}" height="${height}" viewBox="0 0 ${layoutWidth} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeXml(this.definition.name)} workflow"><defs><marker id="${marker}" markerWidth="10" markerHeight="10" refX="0" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0L10 5L0 10Z" fill="${WORKFLOW_EDGE_COLOR}"/></marker></defs><g class="chart-edges">${edgeSvg}</g>${nodeSvg}<g class="chart-edge-descriptions">${edgeDescriptionSvg}</g></svg>`;
    this.bindInteractions();
  }

  bindInteractions() {
    if (this.onNodeSelect) {
      this.container.querySelectorAll('[data-node-key]').forEach((element) => {
        const select = () => this.onNodeSelect(element.dataset.nodeKey);
        element.addEventListener('click', select);
        element.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          select();
        });
      });
    }
    this.container.querySelectorAll('[data-edge-index]').forEach((element) => {
      const description = this.container.querySelector(
        `[data-edge-description="${element.dataset.edgeIndex}"]`,
      );
      if (!description) return;
      const show = () => description.classList.add('visible');
      const hide = () => description.classList.remove('visible');
      element.addEventListener('pointerenter', show);
      element.addEventListener('pointerleave', hide);
      element.addEventListener('focus', show);
      element.addEventListener('blur', hide);
    });
  }

  destroy() {
    this.observer?.disconnect();
    window.removeEventListener('resize', this.resize);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
  }
}

export function mountWorkflowCharts(root, definitions, options = {}) {
  return [...root.querySelectorAll('[data-workflow-chart]')].map(
    (container) =>
      new WorkflowChart(
        container,
        definitions.find((item) => String(item.id) === container.dataset.workflowChart),
        options,
      ),
  );
}
