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

test('workflow chart uses positions saved by the visual editor', () => {
  const definition = {
    nodes: [
      { key: 'start', type: 'START', config: { x: 160, y: 420 } },
      { key: 'review', type: 'USER_TASK', config: { x: 480, y: 120 } },
      { key: 'end', type: 'END', config: { x: 840, y: 420 } },
    ],
    edges: [
      { from: 'start', to: 'review' },
      { from: 'review', to: 'end' },
    ],
  };

  const layout = WorkflowChart.prototype.layout.call({ definition }, 800);

  assert.equal(layout.manual, true);
  assert.deepEqual(layout.positions.get('review'), { x: 480, y: 120 });
  assert.equal(layout.width, 1000);
  assert.equal(layout.height, 600);
});

test('long and backward connectors use the editor cubic renderer', () => {
  const long = routeConnector({ x: 100, y: 110 }, { x: 600, y: 220 }, 400, 0);
  const backward = routeConnector({ x: 600, y: 220 }, { x: 100, y: 110 }, 400, 1);

  assert.equal(long.path, 'M 166 110 C 350 110, 350 220, 534 220');
  assert.equal(backward.path, 'M 666 220 C 850 220, -150 110, 34 110');
  assert.equal((long.path.match(/C/g) || []).length, 1);
  assert.equal((backward.path.match(/C/g) || []).length, 1);
});

test('adjacent connectors use a fluid cubic curve', () => {
  const route = routeConnector({ x: 100, y: 80 }, { x: 290, y: 180 }, 300, 0, false);

  assert.equal(route.path, 'M 166 80 C 195 80, 195 180, 224 180');
  assert.ok(!route.path.includes(' H'));
  assert.ok(!route.path.includes(' V'));
});

test('connector rendering is unaffected by display-only routing hints', () => {
  const upperRoute = routeConnector({ x: 100, y: 90 }, { x: 600, y: 160 }, 400, 0, true);
  const lowerRoute = routeConnector({ x: 100, y: 300 }, { x: 600, y: 340 }, 400, 0, true);

  assert.equal(upperRoute.path, 'M 166 90 C 350 90, 350 160, 534 160');
  assert.equal(lowerRoute.path, 'M 166 300 C 350 300, 350 340, 534 340');
});
