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
const escapeXml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

export class WorkflowChart {
  constructor(container, definition) {
    this.container = container;
    this.definition = definition;
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
    const nodeWidth = Math.max(92, Math.min(138, (width - pad * 2) / Math.max(ranks.length, 1) - 28));
    const gapX = ranks.length > 1 ? (width - pad * 2 - nodeWidth) / (ranks.length - 1) : 0;
    const maxRows = Math.max(1, ...[...columns.values()].map((list) => list.length));
    const height = Math.max(220, maxRows * 112 + 76);
    const positions = new Map();
    ranks.forEach((r, ci) => {
      const list = columns.get(r);
      const gapY = height / (list.length + 1);
      list.forEach((node, ri) => positions.set(node.key, { x: pad + nodeWidth / 2 + ci * gapX, y: gapY * (ri + 1) }));
    });
    return { width, height, nodeWidth, positions, edges, nodes };
  }

  render() {
    const measuredWidth = Math.floor(this.container.clientWidth || 800);
    this.width = measuredWidth;
    const width = Math.max(480, measuredWidth);
    const { height, nodeWidth, positions, edges, nodes } = this.layout(width);
    const nodeHeight = 68;
    const marker = `arrow-${this.definition.id}`;
    const edgeSvg = edges
      .map((edge) => {
        const a = positions.get(edge.from),
          b = positions.get(edge.to);
        if (!a || !b) return '';
        const x1 = a.x + nodeWidth / 2,
          x2 = b.x - nodeWidth / 2,
          mid = (x1 + x2) / 2;
        return `<path d="M${x1} ${a.y} C${mid} ${a.y},${mid} ${b.y},${x2} ${b.y}" fill="none" stroke="#8190a5" stroke-width="2"/><text x="${mid}" y="${(a.y + b.y) / 2 - 8}">${escapeXml(edge.condition || '')}</text>`;
      })
      .join('');
    const nodeSvg = nodes
      .map((node) => {
        const p = positions.get(node.key),
          radius = node.type.includes('GATEWAY') ? 30 : 10;
        return `<g class="chart-node chart-${node.type.toLowerCase()}"><rect x="${p.x - nodeWidth / 2}" y="${p.y - nodeHeight / 2}" width="${nodeWidth}" height="${nodeHeight}" rx="${radius}" fill="${COLORS[node.type] || '#eef1f5'}" stroke="${STROKES[node.type] || '#8795aa'}"/><text class="chart-type" x="${p.x}" y="${p.y - 7}">${escapeXml(node.type.replaceAll('_', ' '))}</text><text class="chart-label" x="${p.x}" y="${p.y + 13}">${escapeXml((node.name || node.key).slice(0, 22))}</text></g>`;
      })
      .join('');
    this.container.innerHTML = `<svg class="workflow-svg" style="display:block;width:100%;min-width:0;height:auto" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeXml(this.definition.name)} workflow"><defs><marker id="${marker}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#8190a5"/></marker></defs><g class="chart-edges" marker-end="url(#${marker})">${edgeSvg}</g>${nodeSvg}</svg>`;
  }

  destroy() {
    this.observer?.disconnect();
    window.removeEventListener('resize', this.resize);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
  }
}

export function mountWorkflowCharts(root, definitions) {
  return [...root.querySelectorAll('[data-workflow-chart]')].map(
    (container) =>
      new WorkflowChart(
        container,
        definitions.find((item) => String(item.id) === container.dataset.workflowChart),
      ),
  );
}
