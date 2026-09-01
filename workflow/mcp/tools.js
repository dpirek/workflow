// Dependency-free MCP tool registry.
const toolNames = [
  'deploy_workflow',
  'list_workflows',
  'get_workflow',
  'start_process',
  'get_process_instance',
  'list_process_instances',
  'set_variables',
  'cancel_process',
  'list_tasks',
  'claim_task',
  'complete_task',
  'fetch_and_lock_jobs',
  'complete_job',
  'fail_job',
  'retry_job',
  'run_due_timers',
  'publish_message',
  'list_incidents',
  'resolve_incident',
  'get_history',
];

const inputSchemas = {
  start_process: {
    type: 'object',
    properties: {
      processKey: { type: 'string', description: 'Workflow process key' },
      definitionId: { type: 'integer', description: 'Active workflow definition ID' },
      version: { type: 'integer', minimum: 1 },
      businessKey: { type: 'string' },
      variables: { type: 'object', additionalProperties: true },
    },
    anyOf: [{ required: ['processKey'] }, { required: ['definitionId'] }],
    additionalProperties: false,
  },
};

export function buildMcpServer(engine) {
  const handlers = {
    deploy_workflow: ({ definition }) => engine.deploy(definition),
    list_workflows: ({ key }) => engine.listDefinitions(key),
    get_workflow: ({ definitionId }) => engine.getDefinition(definitionId),
    start_process: (input) => startProcess(engine, input),
    get_process_instance: ({ instanceId }) => engine.getProcessInstance(instanceId),
    list_process_instances: (query) => engine.listProcessInstances(query),
    set_variables: ({ instanceId, variables = {} }) => engine.setVariables(instanceId, variables),
    cancel_process: ({ instanceId }) => engine.cancelProcess(instanceId),
    list_tasks: (query) => engine.listTasks(query),
    claim_task: ({ taskId, assignee }) => engine.claimTask(taskId, assignee),
    complete_task: ({ taskId, variables = {} }) => engine.completeTask(taskId, variables),
    fetch_and_lock_jobs: ({ workerId, ...options }) => engine.fetchAndLockJobs(workerId, options),
    complete_job: ({ jobId, workerId, variables = {} }) => engine.completeJob(jobId, workerId, variables),
    fail_job: ({ jobId, workerId, error, retryDelayMs }) => engine.failJob(jobId, workerId, error, retryDelayMs),
    retry_job: ({ jobId, retries = 3, delayMs = 0 }) => engine.retryJob(jobId, retries, delayMs),
    run_due_timers: ({ limit = 100 }) => engine.runDueTimers(limit),
    publish_message: ({ messageName, correlationKey, variables = {} }) =>
      engine.publishMessage(messageName, correlationKey, variables),
    list_incidents: (query) => engine.listIncidents(query),
    resolve_incident: ({ incidentId, retryJob = false, retries = 3 }) =>
      engine.resolveIncident(incidentId, { retryJob, retries }),
    get_history: ({ instanceId, ...query }) => engine.getHistory(instanceId, query),
  };
  const tools = toolNames.map((name) => ({
    name,
    description: `Workflow operation: ${name}`,
    inputSchema: inputSchemas[name] || { type: 'object' },
  }));
  return {
    tools,
    async close() {},
    async handle(request) {
      if (request.method === 'initialize')
        return {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'sqlite-workflow-engine', version: '1.0.0' },
        };
      if (request.method === 'notifications/initialized') return null;
      if (request.method === 'tools/list') return { tools };
      if (request.method === 'tools/call') {
        const { name, arguments: args = {} } = request.params || {};
        if (!handlers[name]) throw new Error(`Unknown tool: ${name}`);
        try {
          const result = handlers[name](args);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: { result } };
        } catch (error) {
          return {
            isError: true,
            content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
          };
        }
      }
      throw new Error(`Unsupported method: ${request.method}`);
    },
  };
}

function startProcess(engine, input = {}) {
  const { processKey, definitionId, variables = {}, businessKey, version } = input;
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
    throw new Error('start_process variables must be an object');
  }

  if (definitionId !== undefined && definitionId !== null) {
    const id = Number(definitionId);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error('start_process definitionId must be a positive integer');
    const definition = engine.getDefinition(id);
    if (definition.status !== 'ACTIVE') throw new Error(`Process definition ${id} is not active`);
    return engine.startProcess(definition.key, variables, {
      businessKey,
      version: definition.version,
    });
  }

  if (typeof processKey !== 'string' || !processKey.trim()) {
    throw new Error('start_process requires processKey or definitionId');
  }
  return engine.startProcess(processKey.trim(), variables, { businessKey, version });
}
