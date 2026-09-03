import assert from 'node:assert/strict';
import test from 'node:test';
import { routeConnector, WorkflowChart } from '../public/app/components/workflow-chart.js';
import { allocateConnectorSides } from '../public/app/components/workflow-connectors.js';

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

  assert.equal(long.path, 'M 166 110 C 345 110, 345 220, 524 220');
  assert.equal(backward.path, 'M 534 220 C 355 220, 355 110, 176 110');
  assert.equal((long.path.match(/C/g) || []).length, 1);
  assert.equal((backward.path.match(/C/g) || []).length, 1);
});

test('vertical connectors leave and enter through the nearest box sides', () => {
  const downward = routeConnector({ x: 300, y: 100 }, { x: 330, y: 400 });
  const upward = routeConnector({ x: 330, y: 400 }, { x: 300, y: 100 });

  assert.equal(downward.direction, 'vertical');
  assert.deepEqual(downward.start, { x: 300, y: 138 });
  assert.deepEqual(downward.end, { x: 330, y: 362 });
  assert.deepEqual(downward.lineEnd, { x: 330, y: 352 });
  assert.equal(downward.path, 'M 300 138 C 300 245, 330 245, 330 352');
  assert.deepEqual(upward.start, { x: 330, y: 362 });
  assert.deepEqual(upward.end, { x: 300, y: 138 });
  assert.deepEqual(upward.lineEnd, { x: 300, y: 148 });
  assert.equal(upward.path, 'M 330 362 C 330 255, 300 255, 300 148');
});

test('horizontal connectors use left and right box sides', () => {
  const rightward = routeConnector({ x: 100, y: 100 }, { x: 400, y: 130 });
  const leftward = routeConnector({ x: 400, y: 130 }, { x: 100, y: 100 });

  assert.equal(rightward.direction, 'horizontal');
  assert.deepEqual(rightward.start, { x: 166, y: 100 });
  assert.deepEqual(rightward.end, { x: 334, y: 130 });
  assert.deepEqual(rightward.lineEnd, { x: 324, y: 130 });
  assert.deepEqual(leftward.start, { x: 334, y: 130 });
  assert.deepEqual(leftward.end, { x: 166, y: 100 });
  assert.deepEqual(leftward.lineEnd, { x: 176, y: 100 });
});

test('multiple connectors claim the next closest unused side', () => {
  const positions = new Map([
    ['parent', { x: 500, y: 100 }],
    ['left-child', { x: 430, y: 400 }],
    ['right-child', { x: 570, y: 400 }],
    ['center-child', { x: 500, y: 500 }],
  ]);
  const assignments = allocateConnectorSides(positions, [
    { from: 'parent', to: 'left-child' },
    { from: 'parent', to: 'right-child' },
    { from: 'parent', to: 'center-child' },
  ]);

  assert.deepEqual(assignments.map(({ sourceSide }) => sourceSide), ['bottom', 'right', 'left']);
  assert.equal(new Set(assignments.map(({ sourceSide }) => sourceSide)).size, 3);
  assert.deepEqual(assignments.map(({ targetSide }) => targetSide), ['top', 'top', 'top']);
});

test('incoming and outgoing connectors share the same side allocation', () => {
  const positions = new Map([
    ['above', { x: 500, y: 80 }],
    ['hub', { x: 500, y: 300 }],
    ['also-above', { x: 540, y: 80 }],
  ]);
  const assignments = allocateConnectorSides(positions, [
    { from: 'above', to: 'hub' },
    { from: 'hub', to: 'also-above' },
  ]);

  assert.equal(assignments[0].targetSide, 'top');
  assert.notEqual(assignments[1].sourceSide, 'top');
});

test('adjacent connectors use a fluid cubic curve', () => {
  const route = routeConnector({ x: 100, y: 80 }, { x: 290, y: 180 }, 300, 0, false);

  assert.equal(route.path, 'M 166 80 C 190 80, 190 180, 214 180');
  assert.ok(!route.path.includes(' H'));
  assert.ok(!route.path.includes(' V'));
});

test('connector rendering is unaffected by display-only routing hints', () => {
  const upperRoute = routeConnector({ x: 100, y: 90 }, { x: 600, y: 160 }, 400, 0, true);
  const lowerRoute = routeConnector({ x: 100, y: 300 }, { x: 600, y: 340 }, 400, 0, true);

  assert.equal(upperRoute.path, 'M 166 90 C 345 90, 345 160, 524 160');
  assert.equal(lowerRoute.path, 'M 166 300 C 345 300, 345 340, 524 340');
});
