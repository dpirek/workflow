import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkflowChart } from '../public/app/components/workflow-chart.js';

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
