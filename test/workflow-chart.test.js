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
