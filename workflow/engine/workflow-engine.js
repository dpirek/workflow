import { withTransaction } from '../database/database.js';
import { WorkflowRepository } from '../database/repository.js';
import { validateDefinition } from '../definitions/validator.js';
import { evaluateExpression } from '../expression/evaluator.js';

const MAX_AUTOMATIC_TRANSITIONS = 10_000;

export class WorkflowEngine {
  constructor(db) {
    this.db = db;
    this.repo = new WorkflowRepository(db);
  }

  close() { this.db.close(); }

  deploy(definition) {
    validateDefinition(definition);
    return withTransaction(this.db, () => {
      const version = this.repo.nextDefinitionVersion(definition.key);
      const id = this.repo.insertDefinition({ ...definition, version });
      const nodeIds = new Map();
      for (const node of definition.nodes) nodeIds.set(node.key, this.repo.insertNode(id, node));
      for (const edge of definition.edges) this.repo.insertEdge(id, edge, nodeIds);
      return this.getDefinition(id);
    });
  }

  getDefinition(id) {
    const row = this.repo.getDefinitionById(id);
    if (!row) throw new Error(`Process definition ${id} not found`);
    const graph = this.repo.definitionGraph(id);
    return {
      id: row.id,
      key: row.process_key,
      name: row.name,
      version: row.version,
      description: row.description,
      status: row.status,
      createdAt: row.created_at,
      nodes: graph.nodes.map((node) => ({
        id: node.id, key: node.node_key, name: node.name, type: node.node_type, config: parseJson(node.config_json, {})
      })),
      edges: graph.edges.map((edge) => ({
        id: edge.id, key: edge.edge_key, from: edge.source_key, to: edge.target_key,
        condition: edge.condition_expression, priority: edge.priority
      }))
    };
  }

  listDefinitions(key) {
    return this.repo.listDefinitions(key).map((row) => ({
      id: row.id, key: row.process_key, name: row.name, version: row.version,
      description: row.description, status: row.status, createdAt: row.created_at
    }));
  }

  startProcess(processKey, variables = {}, options = {}) {
    return withTransaction(this.db, () => {
      const definition = this.repo.findDefinition(processKey, options.version);
      if (!definition) throw new Error(`Active process definition not found: ${processKey}${options.version ? ` v${options.version}` : ''}`);
      const start = this.repo.startNode(definition.id);
      if (!start) throw new Error(`Definition ${definition.id} has no START node`);
      const instanceId = this.repo.insertInstance(definition.id, options.businessKey, options.parentInstanceId ?? null);
      this.repo.upsertVariables(instanceId, variables);
      const tokenId = this.repo.insertToken(instanceId, start.id);
      this.repo.addHistory(instanceId, 'PROCESS_STARTED', { tokenId, nodeId: start.id }, {
        processKey, version: definition.version, businessKey: options.businessKey ?? null
      });
      this.repo.addHistory(instanceId, 'TOKEN_CREATED', { tokenId, nodeId: start.id });
      this.executeTokens([tokenId]);
      return this.getProcessInstance(instanceId);
    });
  }

  getProcessInstance(id) {
    const instance = this.repo.instance(id);
    if (!instance) throw new Error(`Process instance ${id} not found`);
    const definition = this.repo.getDefinitionById(instance.process_definition_id);
    return {
      id: instance.id,
      processDefinitionId: definition.id,
      processKey: definition.process_key,
      processName: definition.name,
      version: definition.version,
      businessKey: instance.business_key,
      status: instance.status,
      startedAt: instance.started_at,
      endedAt: instance.ended_at,
      parentInstanceId: instance.parent_instance_id,
      variables: this.repo.variables(id),
      tokens: this.repo.tokensForInstance(id).map(mapToken),
      tasks: this.repo.listTasks({ instanceId: id, limit: 500 }).map(mapTask),
      jobs: this.repo.jobsForInstance(id).map(mapJob),
      incidents: this.repo.listIncidents(undefined, id, 500).map(mapIncident)
    };
  }

  listProcessInstances(query = {}) {
    return this.repo.listInstances(query).map((row) => ({
      id: row.id, processDefinitionId: row.process_definition_id, processKey: row.process_key,
      processName: row.process_name, version: row.version, businessKey: row.business_key,
      status: row.status, startedAt: row.started_at, endedAt: row.ended_at
    }));
  }

  setVariables(instanceId, variables) {
    return withTransaction(this.db, () => {
      this.requireRunningInstance(instanceId);
      this.applyVariables(instanceId, variables);
      return this.repo.variables(instanceId);
    });
  }

  cancelProcess(instanceId) {
    return withTransaction(this.db, () => {
      const instance = this.repo.instance(instanceId);
      if (!instance) throw new Error(`Process instance ${instanceId} not found`);
      if (instance.status === 'CANCELLED') return this.getProcessInstance(instanceId);
      if (instance.status === 'COMPLETED') throw new Error('A completed process cannot be cancelled');
      this.repo.updateInstanceStatus(instanceId, 'CANCELLED', true);
      this.repo.cancelTokens(instanceId);
      this.repo.cancelTasks(instanceId);
      this.repo.cancelJobs(instanceId);
      this.repo.addHistory(instanceId, 'PROCESS_CANCELLED', {}, {});
      return this.getProcessInstance(instanceId);
    });
  }

  listTasks(query = {}) { return this.repo.listTasks(query).map(mapTask); }

  claimTask(taskId, assignee) {
    return withTransaction(this.db, () => {
      const task = this.repo.task(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      this.requireRunningInstance(task.process_instance_id);
      if (task.status === 'CLAIMED' && task.assignee === assignee) return mapTask(task);
      if (task.status !== 'CREATED') throw new Error(`Task ${taskId} cannot be claimed from status ${task.status}`);
      if (!this.repo.claimTask(taskId, assignee)) throw new Error(`Task ${taskId} was claimed concurrently`);
      this.repo.addHistory(task.process_instance_id, 'TASK_CLAIMED', { taskId, tokenId: task.token_id, nodeId: task.node_id }, { assignee });
      return mapTask(this.repo.task(taskId));
    });
  }

  completeTask(taskId, variables = {}) {
    return withTransaction(this.db, () => {
      const task = this.repo.task(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      if (task.status === 'COMPLETED') return { alreadyCompleted: true, instance: this.getProcessInstance(task.process_instance_id) };
      this.requireRunningInstance(task.process_instance_id);
      if (!this.repo.completeTask(taskId)) throw new Error(`Task ${taskId} cannot be completed from status ${task.status}`);
      this.applyVariables(task.process_instance_id, variables);
      this.repo.setTokenState(task.token_id, 'ACTIVE');
      this.repo.addHistory(task.process_instance_id, 'TASK_COMPLETED', { taskId, tokenId: task.token_id, nodeId: task.node_id }, { variables });
      this.completeCurrentNodeAndFollow(task.token_id, [task.token_id]);
      return { alreadyCompleted: false, instance: this.getProcessInstance(task.process_instance_id) };
    });
  }

  fetchAndLockJobs(workerId, options = {}) {
    return withTransaction(this.db, () => {
      const now = sqlTime();
      this.repo.recoverExpiredJobs(now);
      const maxJobs = Math.min(Math.max(options.maxJobs ?? 10, 1), 100);
      const lockedUntil = sqlTime(Date.now() + Math.min(Math.max(options.lockMs ?? 60_000, 1_000), 3_600_000));
      const candidates = this.repo.readyServiceJobs(options.workerTypes, maxJobs, now);
      const claimed = [];
      for (const job of candidates) {
        if (!this.repo.claimJob(job.id, workerId, lockedUntil)) continue;
        const updated = this.repo.job(job.id);
        this.repo.addHistory(job.process_instance_id, 'JOB_STARTED', { jobId: job.id, tokenId: job.token_id, nodeId: job.node_id }, { workerId, lockedUntil });
        claimed.push({ ...mapJob(updated), variables: this.repo.variables(job.process_instance_id) });
      }
      return claimed;
    });
  }

  completeJob(jobId, workerId, variables = {}) {
    return withTransaction(this.db, () => {
      const job = this.repo.job(jobId);
      if (!job) throw new Error(`Job ${jobId} not found`);
      if (job.status === 'COMPLETED') return { alreadyCompleted: true, instance: this.getProcessInstance(job.process_instance_id) };
      this.requireRunningInstance(job.process_instance_id);
      if (job.status !== 'RUNNING') throw new Error(`Job ${jobId} cannot be completed from status ${job.status}`);
      if (job.locked_by !== workerId) throw new Error(`Job ${jobId} is locked by ${job.locked_by || 'another worker'}`);
      this.repo.completeJob(jobId);
      this.applyVariables(job.process_instance_id, variables);
      this.repo.setTokenState(job.token_id, 'ACTIVE');
      this.repo.addHistory(job.process_instance_id, 'JOB_COMPLETED', { jobId, tokenId: job.token_id, nodeId: job.node_id }, { workerId, variables });
      this.completeCurrentNodeAndFollow(job.token_id, [job.token_id]);
      return { alreadyCompleted: false, instance: this.getProcessInstance(job.process_instance_id) };
    });
  }

  failJob(jobId, workerId, errorMessage, retryDelayMs) {
    return withTransaction(this.db, () => {
      const job = this.repo.job(jobId);
      if (!job) throw new Error(`Job ${jobId} not found`);
      if (job.status !== 'RUNNING') throw new Error(`Job ${jobId} cannot fail from status ${job.status}`);
      if (job.locked_by !== workerId) throw new Error(`Job ${jobId} is locked by ${job.locked_by || 'another worker'}`);
      const retries = Math.max(Number(job.retries) - 1, 0);
      this.repo.addHistory(job.process_instance_id, 'JOB_FAILED', { jobId, tokenId: job.token_id, nodeId: job.node_id }, { workerId, error: errorMessage, retries });
      if (retries > 0) {
        const attempt = Math.max(1, 4 - retries);
        const delay = retryDelayMs ?? [5_000, 30_000, 300_000][Math.min(attempt - 1, 2)];
        this.repo.retryJob(jobId, retries, sqlTime(Date.now() + delay), errorMessage);
      } else {
        this.repo.deadJob(jobId, errorMessage);
        const incidentId = this.createIncident(job.process_instance_id, job.id, job.node_id, 'JOB_RETRIES_EXHAUSTED', errorMessage, { workerId });
        this.repo.addHistory(job.process_instance_id, 'INCIDENT_CREATED', { jobId, nodeId: job.node_id }, { incidentId, error: errorMessage });
      }
      return mapJob(this.repo.job(jobId));
    });
  }

  retryJob(jobId, retries = 3, delayMs = 0) {
    return withTransaction(this.db, () => {
      const job = this.repo.job(jobId);
      if (!job) throw new Error(`Job ${jobId} not found`);
      if (!['DEAD', 'FAILED'].includes(job.status)) throw new Error(`Job ${jobId} cannot be retried from status ${job.status}`);
      this.repo.retryJob(jobId, Math.max(retries, 1), sqlTime(Date.now() + Math.max(delayMs, 0)));
      this.repo.addHistory(job.process_instance_id, 'JOB_RETRIED', { jobId, tokenId: job.token_id, nodeId: job.node_id }, { retries, delayMs });
      return mapJob(this.repo.job(jobId));
    });
  }

  runDueTimers(limit = 100) {
    return withTransaction(this.db, () => {
      const jobs = this.repo.dueJobs('TIMER', sqlTime(), Math.min(Math.max(limit, 1), 500));
      for (const job of jobs) {
        this.repo.completeJob(job.id);
        this.repo.setTokenState(job.token_id, 'ACTIVE');
        this.repo.addHistory(job.process_instance_id, 'TIMER_FIRED', { jobId: job.id, tokenId: job.token_id, nodeId: job.node_id });
        this.completeCurrentNodeAndFollow(job.token_id, [job.token_id]);
      }
      return { fired: jobs.length, jobIds: jobs.map((job) => job.id) };
    });
  }

  publishMessage(messageName, correlationKey, variables = {}) {
    return withTransaction(this.db, () => {
      const match = this.repo.messageJobs().find((job) => {
        const payload = parseJson(job.payload_json, {});
        return payload.messageName === messageName && String(payload.correlationKey ?? job.business_key ?? '') === String(correlationKey);
      });
      if (!match) throw new Error(`No waiting subscription for message ${messageName} and correlation ${correlationKey}`);
      this.repo.completeJob(match.id);
      this.applyVariables(match.process_instance_id, variables);
      this.repo.setTokenState(match.token_id, 'ACTIVE');
      this.repo.addHistory(match.process_instance_id, 'MESSAGE_RECEIVED', { jobId: match.id, tokenId: match.token_id, nodeId: match.node_id }, { messageName, correlationKey, variables });
      this.completeCurrentNodeAndFollow(match.token_id, [match.token_id]);
      return this.getProcessInstance(match.process_instance_id);
    });
  }

  listIncidents(query = {}) { return this.repo.listIncidents(query.status, query.instanceId, query.limit).map(mapIncident); }

  resolveIncident(incidentId, options = {}) {
    return withTransaction(this.db, () => {
      const incident = this.repo.incident(incidentId);
      if (!incident) throw new Error(`Incident ${incidentId} not found`);
      if (incident.status === 'RESOLVED') return mapIncident(incident);
      if (options.retryJob && incident.job_id) {
        const job = this.repo.job(incident.job_id);
        if (job?.status === 'DEAD') this.repo.retryJob(job.id, Math.max(options.retries ?? 3, 1), sqlTime());
      }
      this.repo.resolveIncident(incidentId);
      this.repo.addHistory(incident.process_instance_id, 'INCIDENT_RESOLVED', { jobId: incident.job_id, nodeId: incident.node_id }, { incidentId, retryJob: Boolean(options.retryJob) });
      return mapIncident(this.repo.incident(incidentId));
    });
  }

  getHistory(instanceId, query = {}) {
    if (!this.repo.instance(instanceId)) throw new Error(`Process instance ${instanceId} not found`);
    return this.repo.history(instanceId, query.type, query.limit).map((row) => ({
      id: row.id, processInstanceId: row.process_instance_id, nodeId: row.node_id, tokenId: row.token_id,
      taskId: row.task_id, jobId: row.job_id, type: row.event_type,
      data: parseJson(row.event_data_json, {}), createdAt: row.created_at
    }));
  }

  executeTokens(initialTokenIds) {
    const queue = [...initialTokenIds];
    let transitions = 0;
    while (queue.length) {
      if (++transitions > MAX_AUTOMATIC_TRANSITIONS) throw new Error('Automatic transition limit exceeded; the workflow likely contains an infinite loop');
      const tokenId = queue.shift();
      const token = this.repo.token(tokenId);
      if (!token || token.state !== 'ACTIVE') continue;
      const instance = this.repo.instance(token.process_instance_id);
      if (!instance || instance.status !== 'RUNNING') continue;
      const node = this.repo.node(token.node_id);
      if (!node) { this.haltWithIncident(token, null, 'MISSING_NODE', `Token ${token.id} references missing node ${token.node_id}`); continue; }
      const config = parseJson(node.config_json, {});
      this.repo.addHistory(token.process_instance_id, 'NODE_ENTERED', { tokenId: token.id, nodeId: node.id }, { nodeKey: node.node_key, nodeType: node.node_type });

      switch (node.node_type) {
        case 'START':
          this.followSingle(token, node, queue);
          break;
        case 'END':
          this.completeNode(token, node);
          this.repo.setTokenState(token.id, 'COMPLETED');
          this.repo.addHistory(token.process_instance_id, 'TOKEN_COMPLETED', { tokenId: token.id, nodeId: node.id });
          this.checkProcessCompletion(token.process_instance_id);
          break;
        case 'USER_TASK': {
          const existing = this.repo.activeTaskFor(token.id, node.id);
          const taskId = existing?.id ?? this.repo.insertTask(token, node, config);
          this.repo.setTokenState(token.id, 'WAITING');
          if (!existing) this.repo.addHistory(token.process_instance_id, 'TASK_CREATED', { taskId, tokenId: token.id, nodeId: node.id }, { taskKey: node.node_key, name: node.name });
          break;
        }
        case 'SERVICE_TASK':
        case 'SCRIPT_TASK':
          this.createWaitingJob(token, node, 'SERVICE_TASK', {
            ...config, workerType: config.workerType || `script.${node.node_key}`, nodeKey: node.node_key
          }, config.retries ?? 3, sqlTime());
          break;
        case 'TIMER': {
          const dueAt = timerDueAt(config);
          this.createWaitingJob(token, node, 'TIMER', { ...config, nodeKey: node.node_key }, 1, dueAt);
          break;
        }
        case 'MESSAGE': {
          const variables = this.repo.variables(token.process_instance_id);
          const instanceRow = this.repo.instance(token.process_instance_id);
          const correlationKey = config.correlationKey
            ? (variables[config.correlationKey] ?? config.correlationKey)
            : instanceRow.business_key;
          this.createWaitingJob(token, node, 'MESSAGE', {
            ...config, messageName: config.messageName || node.node_key, correlationKey, nodeKey: node.node_key
          }, 1, null);
          break;
        }
        case 'EXCLUSIVE_GATEWAY':
          this.followExclusive(token, node, queue);
          break;
        case 'PARALLEL_GATEWAY':
          this.followParallel(token, node, queue);
          break;
        default:
          this.haltWithIncident(token, node, 'UNSUPPORTED_NODE', `Unsupported node type ${node.node_type}`);
      }
    }
  }

  completeCurrentNodeAndFollow(tokenId, queue) {
    const token = this.repo.token(tokenId);
    const node = this.repo.node(token.node_id);
    this.completeNode(token, node);
    const edges = this.repo.outgoingEdges(node.id);
    if (edges.length !== 1) {
      this.haltWithIncident(token, node, 'INVALID_OUTGOING_EDGE_COUNT', `${node.node_type} ${node.node_key} requires exactly one outgoing edge`);
      return;
    }
    this.repo.moveToken(token.id, edges[0].target_node_id);
    this.executeTokens(queue);
  }

  followSingle(token, node, queue) {
    const edges = this.repo.outgoingEdges(node.id);
    if (edges.length !== 1) {
      this.haltWithIncident(token, node, 'INVALID_OUTGOING_EDGE_COUNT', `${node.node_type} ${node.node_key} requires exactly one outgoing edge`);
      return;
    }
    this.completeNode(token, node);
    this.repo.moveToken(token.id, edges[0].target_node_id);
    queue.push(token.id);
  }

  followExclusive(token, node, queue) {
    const edges = this.repo.outgoingEdges(node.id);
    const variables = this.repo.variables(token.process_instance_id);
    let selected;
    let defaultEdge;
    try {
      for (const edge of edges) {
        if (!edge.condition_expression) { defaultEdge ??= edge; continue; }
        if (evaluateExpression(edge.condition_expression, variables)) { selected = edge; break; }
      }
    } catch (error) {
      this.haltWithIncident(token, node, 'EXPRESSION_ERROR', error.message);
      return;
    }
    selected ??= defaultEdge;
    if (!selected) {
      this.haltWithIncident(token, node, 'NO_GATEWAY_ROUTE', `No outgoing condition matched at ${node.node_key}`);
      return;
    }
    this.completeNode(token, node, { selectedEdgeId: selected.id });
    this.repo.moveToken(token.id, selected.target_node_id);
    queue.push(token.id);
  }

  followParallel(token, node, queue) {
    const incoming = this.repo.incomingCount(node.id);
    const outgoing = this.repo.outgoingEdges(node.id);
    let continuation = token;
    if (incoming > 1) {
      this.repo.setTokenState(token.id, 'WAITING');
      const arrivals = this.repo.waitingTokensAt(token.process_instance_id, node.id);
      if (arrivals.length < incoming) return;
      const group = arrivals.slice(0, incoming);
      continuation = group[0];
      for (const consumed of group.slice(1)) {
        this.repo.setTokenState(consumed.id, 'COMPLETED');
        this.repo.addHistory(consumed.process_instance_id, 'TOKEN_COMPLETED', { tokenId: consumed.id, nodeId: node.id }, { reason: 'parallel_join' });
      }
      this.repo.setTokenState(continuation.id, 'ACTIVE');
    }

    if (outgoing.length === 0) {
      this.haltWithIncident(continuation, node, 'NO_OUTGOING_EDGE', `Parallel gateway ${node.node_key} has no outgoing edge`);
      return;
    }
    this.completeNode(continuation, node, { joined: incoming > 1, branches: outgoing.length });
    if (outgoing.length === 1) {
      this.repo.moveToken(continuation.id, outgoing[0].target_node_id);
      queue.push(continuation.id);
      return;
    }

    this.repo.setTokenState(continuation.id, 'COMPLETED');
    this.repo.addHistory(continuation.process_instance_id, 'TOKEN_COMPLETED', { tokenId: continuation.id, nodeId: node.id }, { reason: 'parallel_split' });
    for (const edge of outgoing) {
      const childId = this.repo.insertToken(continuation.process_instance_id, edge.target_node_id, continuation.id);
      this.repo.addHistory(continuation.process_instance_id, 'TOKEN_CREATED', { tokenId: childId, nodeId: edge.target_node_id }, { parentTokenId: continuation.id });
      queue.push(childId);
    }
  }

  createWaitingJob(token, node, type, payload, retries, dueAt) {
    const existing = this.repo.activeJobFor(token.id, node.id);
    const jobId = existing?.id ?? this.repo.insertJob(token, node, type, payload, Math.max(retries, 1), dueAt);
    this.repo.setTokenState(token.id, 'WAITING');
    if (!existing) this.repo.addHistory(token.process_instance_id, 'JOB_CREATED', { jobId, tokenId: token.id, nodeId: node.id }, { jobType: type, dueAt, workerType: payload.workerType });
  }

  completeNode(token, node, data = {}) {
    this.repo.addHistory(token.process_instance_id, 'NODE_COMPLETED', { tokenId: token.id, nodeId: node.id }, { nodeKey: node.node_key, nodeType: node.node_type, ...data });
  }

  checkProcessCompletion(instanceId) {
    if (this.repo.activeTokenCount(instanceId) !== 0) return;
    const instance = this.repo.instance(instanceId);
    if (instance?.status !== 'RUNNING') return;
    this.repo.updateInstanceStatus(instanceId, 'COMPLETED', true);
    this.repo.addHistory(instanceId, 'PROCESS_COMPLETED');
  }

  haltWithIncident(token, node, type, message) {
    this.repo.setTokenState(token.id, 'WAITING');
    const incidentId = this.createIncident(token.process_instance_id, null, node?.id ?? token.node_id, type, message);
    this.repo.addHistory(token.process_instance_id, 'INCIDENT_CREATED', { tokenId: token.id, nodeId: node?.id ?? token.node_id }, { incidentId, type, message });
  }

  createIncident(instanceId, jobId, nodeId, type, message, details) {
    return this.repo.insertIncident({ instanceId, jobId, nodeId, type, message, details: details ? JSON.stringify(details) : null });
  }

  applyVariables(instanceId, variables) {
    if (!variables || typeof variables !== 'object' || Array.isArray(variables)) throw new Error('Variables must be a JSON object');
    const before = this.repo.variables(instanceId);
    this.repo.upsertVariables(instanceId, variables);
    for (const [name, value] of Object.entries(variables)) {
      this.repo.addHistory(instanceId, Object.hasOwn(before, name) ? 'VARIABLE_UPDATED' : 'VARIABLE_CREATED', {}, { name, value });
    }
  }

  requireRunningInstance(instanceId) {
    const instance = this.repo.instance(instanceId);
    if (!instance) throw new Error(`Process instance ${instanceId} not found`);
    if (instance.status !== 'RUNNING') throw new Error(`Process instance ${instanceId} is ${instance.status}`);
    return instance;
  }
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function sqlTime(value = Date.now()) {
  return new Date(value).toISOString().replace('T', ' ').replace('Z', '');
}

function timerDueAt(config) {
  if (config.dueAt) {
    const parsed = Date.parse(config.dueAt);
    if (Number.isNaN(parsed)) throw new Error(`Invalid timer dueAt: ${config.dueAt}`);
    return sqlTime(parsed);
  }
  return sqlTime(Date.now() + Math.max(Number(config.durationMs || 0), 0));
}

function mapToken(row) {
  return { id: row.id, nodeId: row.node_id, nodeKey: row.node_key, nodeName: row.node_name, nodeType: row.node_type, parentTokenId: row.parent_token_id, state: row.state, createdAt: row.created_at, completedAt: row.completed_at };
}

function mapTask(row) {
  return { id: row.id, processInstanceId: row.process_instance_id, tokenId: row.token_id, nodeId: row.node_id, nodeKey: row.node_key, taskKey: row.task_key, name: row.name, status: row.status, assignee: row.assignee, candidateGroup: row.candidate_group, priority: row.priority, dueAt: row.due_at, createdAt: row.created_at, claimedAt: row.claimed_at, completedAt: row.completed_at, processKey: row.process_key, businessKey: row.business_key };
}

function mapJob(row) {
  return { id: row.id, processInstanceId: row.process_instance_id, tokenId: row.token_id, nodeId: row.node_id, type: row.job_type, status: row.status, payload: parseJson(row.payload_json, {}), retries: row.retries, dueAt: row.due_at, lockedBy: row.locked_by, lockedUntil: row.locked_until, lastError: row.last_error, createdAt: row.created_at, completedAt: row.completed_at };
}

function mapIncident(row) {
  return { id: row.id, processInstanceId: row.process_instance_id, jobId: row.job_id, nodeId: row.node_id, type: row.incident_type, message: row.message, details: parseJson(row.details, row.details), status: row.status, createdAt: row.created_at, resolvedAt: row.resolved_at };
}
