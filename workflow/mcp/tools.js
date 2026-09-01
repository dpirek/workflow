import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const variablesSchema = z.record(z.string(), z.unknown()).default({});
const nodeSchema = z.object({
  key: z.string().min(1),
  type: z.enum(['START', 'END', 'USER_TASK', 'SERVICE_TASK', 'SCRIPT_TASK', 'EXCLUSIVE_GATEWAY', 'PARALLEL_GATEWAY', 'TIMER', 'MESSAGE']),
  name: z.string().optional(),
  workerType: z.string().optional(),
  assignee: z.string().optional(),
  candidateGroup: z.string().optional(),
  priority: z.number().int().optional(),
  dueAt: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  retries: z.number().int().positive().optional(),
  messageName: z.string().optional(),
  correlationKey: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional()
});
const edgeSchema = z.object({
  key: z.string().optional(), from: z.string().min(1), to: z.string().min(1),
  condition: z.string().optional(), priority: z.number().int().optional()
});

export function buildMcpServer(engine) {
  const server = new McpServer({ name: 'sqlite-workflow-engine', version: '1.0.0' }, {
    instructions: 'A durable Camunda-like workflow engine. Deploy JSON definitions, start process instances, complete human tasks, and run external service workers with fetch-and-lock jobs.'
  });

  server.registerResource('engine-status', 'workflow://status', {
    title: 'Workflow engine status', description: 'Current process and work counts', mimeType: 'application/json'
  }, async (uri) => {
    const status = {
      definitions: engine.listDefinitions().length,
      runningInstances: engine.listProcessInstances({ status: 'RUNNING', limit: 500 }).length,
      openTasks: engine.listTasks({ status: 'CREATED', limit: 500 }).length + engine.listTasks({ status: 'CLAIMED', limit: 500 }).length,
      openIncidents: engine.listIncidents({ status: 'OPEN', limit: 500 }).length
    };
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(status, null, 2) }] };
  });

  tool(server, 'deploy_workflow', 'Deploy an immutable new version of a JSON workflow definition.', z.object({
    definition: z.object({
      key: z.string().min(1), name: z.string().min(1), description: z.string().optional(),
      nodes: z.array(nodeSchema).min(2), edges: z.array(edgeSchema)
    })
  }), ({ definition }) => engine.deploy(definition), { destructiveHint: false, idempotentHint: false });

  tool(server, 'list_workflows', 'List deployed workflow definitions and versions.', z.object({ key: z.string().optional() }),
    ({ key }) => engine.listDefinitions(key), { readOnlyHint: true });

  tool(server, 'get_workflow', 'Get a deployed workflow definition including its graph.', z.object({ definitionId: z.number().int().positive() }),
    ({ definitionId }) => engine.getDefinition(definitionId), { readOnlyHint: true });

  tool(server, 'start_process', 'Start the latest active workflow version (or an explicit version) and advance until it waits or completes.', z.object({
    processKey: z.string().min(1), variables: variablesSchema, businessKey: z.string().optional(), version: z.number().int().positive().optional()
  }), ({ processKey, variables, businessKey, version }) => engine.startProcess(processKey, variables, { businessKey, version }), { idempotentHint: false });

  tool(server, 'get_process_instance', 'Inspect full durable runtime state for one process instance.', z.object({ instanceId: z.number().int().positive() }),
    ({ instanceId }) => engine.getProcessInstance(instanceId), { readOnlyHint: true });

  tool(server, 'list_process_instances', 'Query process instances.', z.object({
    status: z.enum(['RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'SUSPENDED']).optional(),
    processKey: z.string().optional(), businessKey: z.string().optional(), limit: z.number().int().positive().max(500).default(100)
  }), (query) => engine.listProcessInstances(query), { readOnlyHint: true });

  tool(server, 'set_variables', 'Create or update process-level variables.', z.object({
    instanceId: z.number().int().positive(), variables: variablesSchema
  }), ({ instanceId, variables }) => engine.setVariables(instanceId, variables), { idempotentHint: true });

  tool(server, 'cancel_process', 'Cancel a process and all of its active tokens, tasks, and jobs while retaining history.', z.object({ instanceId: z.number().int().positive() }),
    ({ instanceId }) => engine.cancelProcess(instanceId), { destructiveHint: true, idempotentHint: true });

  tool(server, 'list_tasks', 'Query human workflow tasks.', z.object({
    status: z.enum(['CREATED', 'CLAIMED', 'COMPLETED', 'CANCELLED']).optional(), assignee: z.string().optional(),
    candidateGroup: z.string().optional(), instanceId: z.number().int().positive().optional(), limit: z.number().int().positive().max(500).default(100)
  }), (query) => engine.listTasks(query), { readOnlyHint: true });

  tool(server, 'claim_task', 'Claim an unassigned human task for a user.', z.object({ taskId: z.number().int().positive(), assignee: z.string().min(1) }),
    ({ taskId, assignee }) => engine.claimTask(taskId, assignee), { idempotentHint: true });

  tool(server, 'complete_task', 'Complete a human task, apply output variables, and resume its token.', z.object({
    taskId: z.number().int().positive(), variables: variablesSchema
  }), ({ taskId, variables }) => engine.completeTask(taskId, variables), { idempotentHint: true });

  tool(server, 'fetch_and_lock_jobs', 'Fetch and atomically lock ready service jobs for an external worker.', z.object({
    workerId: z.string().min(1), workerTypes: z.array(z.string()).optional(),
    maxJobs: z.number().int().positive().max(100).default(10), lockMs: z.number().int().min(1000).max(3_600_000).default(60_000)
  }), ({ workerId, ...options }) => engine.fetchAndLockJobs(workerId, options), { idempotentHint: false });

  tool(server, 'complete_job', 'Complete a worker-owned service job, apply output variables, and resume its token.', z.object({
    jobId: z.number().int().positive(), workerId: z.string().min(1), variables: variablesSchema
  }), ({ jobId, workerId, variables }) => engine.completeJob(jobId, workerId, variables), { idempotentHint: true });

  tool(server, 'fail_job', 'Report a service job failure; schedules a retry or opens an incident when retries are exhausted.', z.object({
    jobId: z.number().int().positive(), workerId: z.string().min(1), error: z.string().min(1), retryDelayMs: z.number().int().nonnegative().optional()
  }), ({ jobId, workerId, error, retryDelayMs }) => engine.failJob(jobId, workerId, error, retryDelayMs), { idempotentHint: false });

  tool(server, 'retry_job', 'Manually make a dead/failed job ready again.', z.object({
    jobId: z.number().int().positive(), retries: z.number().int().positive().default(3), delayMs: z.number().int().nonnegative().default(0)
  }), ({ jobId, retries, delayMs }) => engine.retryJob(jobId, retries, delayMs), { idempotentHint: true });

  tool(server, 'run_due_timers', 'Fire durable timer jobs whose due time has passed.', z.object({ limit: z.number().int().positive().max(500).default(100) }),
    ({ limit }) => engine.runDueTimers(limit), { idempotentHint: true });

  tool(server, 'publish_message', 'Correlate an external message to one waiting MESSAGE node and resume it.', z.object({
    messageName: z.string().min(1), correlationKey: z.string().min(1), variables: variablesSchema
  }), ({ messageName, correlationKey, variables }) => engine.publishMessage(messageName, correlationKey, variables), { idempotentHint: false });

  tool(server, 'list_incidents', 'Query workflow incidents.', z.object({
    status: z.enum(['OPEN', 'RESOLVED']).optional(), instanceId: z.number().int().positive().optional(), limit: z.number().int().positive().max(500).default(100)
  }), (query) => engine.listIncidents(query), { readOnlyHint: true });

  tool(server, 'resolve_incident', 'Resolve an incident and optionally requeue its dead job.', z.object({
    incidentId: z.number().int().positive(), retryJob: z.boolean().default(false), retries: z.number().int().positive().default(3)
  }), ({ incidentId, ...options }) => engine.resolveIncident(incidentId, options), { idempotentHint: true });

  tool(server, 'get_history', 'Read append-only lifecycle history for a process instance.', z.object({
    instanceId: z.number().int().positive(), type: z.string().optional(), limit: z.number().int().positive().max(2000).default(500)
  }), ({ instanceId, ...query }) => engine.getHistory(instanceId, query), { readOnlyHint: true });

  return server;
}

function tool(server, name, description, inputSchema, handler, annotations = {}) {
  server.registerTool(name, { description, inputSchema, annotations }, async (input) => {
    try {
      const result = handler(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: { result }
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }]
      };
    }
  });
}
