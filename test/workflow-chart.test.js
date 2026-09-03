import assert from 'node:assert/strict';
import test from 'node:test';
import { routeConnector, WorkflowChart } from '../public/app/components/workflow-chart.js';

test('workflow chart layout terminates for cyclic graphs', () => {
  const definition = {
    nodes: [
      { key: 'start', type: 'START' },
      { key: 'review', type: 'USER_TASK' },
      { key: 'retry', type: 'EXCLUSIVE_GATEWAY' },
      { key: 'end', type: 'END' },
    ],
    edges: [
      { from: 'start', to: 'review' },
      { from: 'review', to: 'retry' },
      { from: 'retry', to: 'review' },
      { from: 'retry', to: 'end' },
    ],
  };

  const layout = WorkflowChart.prototype.layout.call({ definition }, 800);

  assert.equal(layout.positions.size, definition.nodes.length);
  for (const position of layout.positions.values()) {
    assert.ok(Number.isFinite(position.x));
    assert.ok(Number.isFinite(position.y));
  }
});

test('workflow chart expands horizontally when nodes cannot fit', () => {
  const nodes = Array.from({ length: 12 }, (_, index) => ({
    key: `node-${index}`,
    type: index === 0 ? 'START' : index === 11 ? 'END' : 'USER_TASK',
  }));
  const definition = {
    nodes,
    edges: nodes.slice(1).map((node, index) => ({ from: nodes[index].key, to: node.key })),
  };

  const layout = WorkflowChart.prototype.layout.call({ definition }, 800);

  assert.ok(layout.width > 800);
  for (let index = 1; index < nodes.length; index += 1) {
    const previous = layout.positions.get(nodes[index - 1].key);
    const current = layout.positions.get(nodes[index].key);
    assert.ok(current.x - previous.x >= layout.nodeWidth);
  }
});

test('long and backward connectors use curved outer routes', () => {
  const long = routeConnector({ x: 100, y: 110 }, { x: 600, y: 220 }, 400, 0);
  const backward = routeConnector({ x: 600, y: 220 }, { x: 100, y: 110 }, 400, 1);

  assert.match(long.path, /C[^C]+ 30/);
  assert.match(backward.path, /C[^C]+ 30/);
  assert.equal((long.path.match(/C/g) || []).length, 3);
  assert.equal((backward.path.match(/C/g) || []).length, 3);
});

test('adjacent connectors use a fluid cubic curve', () => {
  const route = routeConnector({ x: 100, y: 80 }, { x: 290, y: 180 }, 300, 0, false);

  assert.equal(route.path, 'M169 80 C195 80 195 180 221 180');
  assert.ok(!route.path.includes(' H'));
  assert.ok(!route.path.includes(' V'));
});

test('obstructed connectors choose the shortest outer lane', () => {
  const upperRoute = routeConnector({ x: 100, y: 90 }, { x: 600, y: 160 }, 400, 0, true);
  const lowerRoute = routeConnector({ x: 100, y: 300 }, { x: 600, y: 340 }, 400, 0, true);

  assert.match(upperRoute.path, /C[^C]+ 30/);
  assert.match(lowerRoute.path, /C[^C]+ 370/);
});
