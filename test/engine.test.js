import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../workflow/database/database.js';
import { WorkflowEngine } from '../workflow/engine/workflow-engine.js';

function engine() {
  return new WorkflowEngine(openDatabase(':memory:'));
}

test('deploys, routes a user task, runs an external job, and preserves history', () => {
  const workflow = engine();
  try {
    const deployed = workflow.deploy({
      key: 'approval',
      name: 'Approval',
      nodes: [
        { key: 'start', type: 'START' },
        { key: 'review', type: 'USER_TASK', name: 'Review' },
        { key: 'decision', type: 'EXCLUSIVE_GATEWAY' },
        { key: 'notify', type: 'SERVICE_TASK', workerType: 'email.send', retries: 2 },
        { key: 'end', type: 'END' },
      ],
      edges: [
        { from: 'start', to: 'review' },
        { from: 'review', to: 'decision' },
        { from: 'decision', to: 'notify', condition: 'approved == true', priority: 10 },
        { from: 'decision', to: 'end' },
        { from: 'notify', to: 'end' },
      ],
    });
    assert.equal(deployed.version, 1);
    assert.equal(
      workflow.deploy({
        ...withoutGraph(deployed),
        key: 'approval',
        name: 'Approval',
        nodes: deployed.nodes,
        edges: deployed.edges,
      }).version,
      2,
    );

    const started = workflow.startProcess('approval', { amount: 150 }, { businessKey: 'ORDER-1' });
    assert.equal(started.status, 'RUNNING');
    assert.equal(started.tasks[0].status, 'CREATED');
    workflow.claimTask(started.tasks[0].id, 'alice');
    const completedTask = workflow.completeTask(started.tasks[0].id, { approved: true });
    assert.equal(completedTask.instance.jobs[0].status, 'READY');

    const jobs = workflow.fetchAndLockJobs('worker-1', { workerTypes: ['email.send'] });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].variables.approved, true);
    const completed = workflow.completeJob(jobs[0].id, 'worker-1', { notified: true });
    assert.equal(completed.instance.status, 'COMPLETED');
    assert.equal(completed.instance.variables.notified, true);
    assert.ok(workflow.getHistory(started.id).some((event) => event.type === 'PROCESS_COMPLETED'));
  } finally {
    workflow.close();
  }
});

test('parallel split waits for both user-task branches before joining', () => {
  const workflow = engine();
  try {
    workflow.deploy({
      key: 'parallel',
      name: 'Parallel',
      nodes: [
        { key: 'start', type: 'START' },
        { key: 'split', type: 'PARALLEL_GATEWAY' },
        { key: 'a', type: 'USER_TASK', name: 'A' },
        { key: 'b', type: 'USER_TASK', name: 'B' },
        { key: 'join', type: 'PARALLEL_GATEWAY' },
        { key: 'end', type: 'END' },
      ],
      edges: [
        { from: 'start', to: 'split' },
        { from: 'split', to: 'a' },
        { from: 'split', to: 'b' },
        { from: 'a', to: 'join' },
        { from: 'b', to: 'join' },
        { from: 'join', to: 'end' },
      ],
    });
    const started = workflow.startProcess('parallel');
    assert.equal(started.tasks.length, 2);
    const first = workflow.completeTask(started.tasks[0].id);
    assert.equal(first.instance.status, 'RUNNING');
    const second = workflow.completeTask(started.tasks[1].id);
    assert.equal(second.instance.status, 'COMPLETED');
  } finally {
    workflow.close();
  }
});

test('dead jobs create incidents and can be resolved and retried', () => {
  const workflow = engine();
  try {
    workflow.deploy(serviceDefinition('retry-flow', 1));
    const started = workflow.startProcess('retry-flow');
    const [job] = workflow.fetchAndLockJobs('worker');
    const dead = workflow.failJob(job.id, 'worker', 'service unavailable');
    assert.equal(dead.status, 'DEAD');
    const [incident] = workflow.listIncidents({ status: 'OPEN' });
    assert.equal(incident.type, 'JOB_RETRIES_EXHAUSTED');
    workflow.resolveIncident(incident.id, { retryJob: true, retries: 2 });
    assert.equal(workflow.fetchAndLockJobs('worker').length, 1);
    assert.equal(workflow.getProcessInstance(started.id).status, 'RUNNING');
  } finally {
    workflow.close();
  }
});

test('durable timers and correlated messages resume waiting workflows', () => {
  const workflow = engine();
  try {
    workflow.deploy({
      key: 'events',
      name: 'Events',
      nodes: [
        { key: 'start', type: 'START' },
        { key: 'timer', type: 'TIMER', durationMs: 0 },
        { key: 'message', type: 'MESSAGE', messageName: 'paid' },
        { key: 'end', type: 'END' },
      ],
      edges: [
        { from: 'start', to: 'timer' },
        { from: 'timer', to: 'message' },
        { from: 'message', to: 'end' },
      ],
    });
    const started = workflow.startProcess('events', {}, { businessKey: 'ORDER-2' });
    assert.equal(workflow.runDueTimers().fired, 1);
    const finished = workflow.publishMessage('paid', 'ORDER-2', { paid: true });
    assert.equal(finished.status, 'COMPLETED');
    assert.equal(finished.variables.paid, true);
    assert.equal(finished.id, started.id);
  } finally {
    workflow.close();
  }
});

test('ready work survives an engine and database restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'workflow-recovery-'));
  const path = join(directory, 'workflow.db');
  let first = new WorkflowEngine(openDatabase(path));
  try {
    first.deploy(serviceDefinition('recoverable'));
    const instanceId = first.startProcess('recoverable', { durable: true }).id;
    first.close();
    first = null;

    const restarted = new WorkflowEngine(openDatabase(path));
    try {
      const [job] = restarted.fetchAndLockJobs('restarted-worker');
      assert.equal(job.variables.durable, true);
      assert.equal(restarted.completeJob(job.id, 'restarted-worker').instance.status, 'COMPLETED');
      assert.equal(restarted.getProcessInstance(instanceId).status, 'COMPLETED');
    } finally {
      restarted.close();
    }
  } finally {
    if (first) first.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

function serviceDefinition(key, retries = 3) {
  return {
    key,
    name: key,
    nodes: [
      { key: 'start', type: 'START' },
      { key: 'work', type: 'SERVICE_TASK', workerType: 'work', retries },
      { key: 'end', type: 'END' },
    ],
    edges: [
      { from: 'start', to: 'work' },
      { from: 'work', to: 'end' },
    ],
  };
}

function withoutGraph(value) {
  const { nodes, edges, id, version, status, createdAt, ...definition } = value;
  return definition;
}
