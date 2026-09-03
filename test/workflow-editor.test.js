import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDefaultWorkflow,
  createWorkflowDraft,
  validateWorkflowDraft,
  workflowDefinition,
} from '../public/app/components/workflow-editor.js';

test('creates a valid starter workflow and serializes editor coordinates as config', () => {
  const draft = createDefaultWorkflow();
  assert.deepEqual(validateWorkflowDraft(draft), []);
  assert.deepEqual(workflowDefinition(draft), {
    key: 'untitled-workflow',
    name: 'Untitled workflow',
    nodes: [
      { key: 'start', name: 'Start', type: 'START', config: { x: 170, y: 300 } },
      { key: 'end', name: 'End', type: 'END', config: { x: 830, y: 300 } },
    ],
    edges: [{ from: 'start', to: 'end' }],
  });
});

test('loads a deployed definition into an editable draft without database identifiers', () => {
  const draft = createWorkflowDraft({
    id: 42,
    key: 'approval',
    name: 'Approval',
    version: 3,
    description: null,
    nodes: [
      { id: 10, key: 'start', name: null, type: 'START', config: { x: 90, y: 220 } },
      {
        id: 11,
        key: 'review',
        name: 'Review',
        type: 'USER_TASK',
        config: { assignee: 'alice', x: 420, y: 220 },
      },
      { id: 12, key: 'end', name: null, type: 'END', config: {} },
    ],
    edges: [
      { id: 20, from: 'start', to: 'review', condition: null, priority: 0 },
      { id: 21, from: 'review', to: 'end', condition: 'approved == true', priority: 5 },
    ],
  });

  assert.equal(draft.key, 'approval');
  assert.deepEqual(draft.nodes[1], {
    key: 'review',
    name: 'Review',
    type: 'USER_TASK',
    assignee: 'alice',
    config: { assignee: 'alice' },
    x: 420,
    y: 220,
  });
  assert.equal(draft.nodes[2].x, 490);
  assert.deepEqual(draft.edges[1], {
    from: 'review',
    to: 'end',
    condition: 'approved == true',
    priority: 5,
  });
  assert.deepEqual(validateWorkflowDraft(draft), []);
});

test('reports invalid keys, unreachable nodes, and missing service worker types', () => {
  const draft = createDefaultWorkflow();
  draft.key = 'Bad Key';
  draft.nodes.push({ key: 'send', name: 'Send', type: 'SERVICE_TASK', workerType: '', x: 400, y: 100 });
  const errors = validateWorkflowDraft(draft);
  assert.ok(errors.some((error) => error.includes('Key must')));
  assert.ok(errors.some((error) => error.includes('not connected')));
  assert.ok(errors.some((error) => error.includes('worker type')));
});
