function placeholders(values) {
  return values.map(() => '?').join(', ');
}

export class WorkflowRepository {
  constructor(db) {
    this.db = db;
  }

  insertDefinition({ key, name, version, description }) {
    const result = this.db
      .prepare(
        `
      INSERT INTO process_definition(process_key, name, version, description)
      VALUES (?, ?, ?, ?)
    `,
      )
      .run(key, name, version, description ?? null);
    return Number(result.lastInsertRowid);
  }

  nextDefinitionVersion(key) {
    return Number(
      this.db
        .prepare('SELECT COALESCE(MAX(version), 0) + 1 AS version FROM process_definition WHERE process_key = ?')
        .get(key).version,
    );
  }

  insertNode(definitionId, node) {
    const config = { ...(node.config || {}) };
    for (const field of [
      'workerType',
      'assignee',
      'candidateGroup',
      'priority',
      'dueAt',
      'durationMs',
      'retries',
      'messageName',
      'correlationKey',
    ]) {
      if (node[field] !== undefined) config[field] = node[field];
    }
    const result = this.db
      .prepare(
        `
      INSERT INTO process_node(process_definition_id, node_key, name, node_type, config_json)
      VALUES (?, ?, ?, ?, ?)
    `,
      )
      .run(definitionId, node.key, node.name ?? null, node.type, JSON.stringify(config));
    return Number(result.lastInsertRowid);
  }

  insertEdge(definitionId, edge, nodeIds) {
    this.db
      .prepare(
        `
      INSERT INTO process_edge(process_definition_id, edge_key, source_node_id, target_node_id, condition_expression, priority)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        definitionId,
        edge.key ?? null,
        nodeIds.get(edge.from),
        nodeIds.get(edge.to),
        edge.condition ?? null,
        edge.priority ?? 0,
      );
  }

  getDefinitionById(id) {
    return this.db.prepare('SELECT * FROM process_definition WHERE id = ?').get(id);
  }

  findDefinitionNode(definitionId, nodeKey) {
    return this.db
      .prepare('SELECT * FROM process_node WHERE process_definition_id = ? AND node_key = ?')
      .get(definitionId, nodeKey);
  }

  updateNodeConfig(nodeId, config) {
    this.db.prepare('UPDATE process_node SET config_json = ? WHERE id = ?').run(JSON.stringify(config), nodeId);
  }

  findDefinition(key, version) {
    if (version !== undefined && version !== null) {
      return this.db
        .prepare('SELECT * FROM process_definition WHERE process_key = ? AND version = ?')
        .get(key, version);
    }
    return this.db
      .prepare(
        `
      SELECT * FROM process_definition
      WHERE process_key = ? AND status = 'ACTIVE'
      ORDER BY version DESC LIMIT 1
    `,
      )
      .get(key);
  }

  listDefinitions(key) {
    const rows = key
      ? this.db.prepare('SELECT * FROM process_definition WHERE process_key = ? ORDER BY version DESC').all(key)
      : this.db.prepare('SELECT * FROM process_definition ORDER BY process_key, version DESC').all();
    return rows;
  }

  definitionGraph(definitionId) {
    return {
      nodes: this.db
        .prepare('SELECT * FROM process_node WHERE process_definition_id = ? ORDER BY id')
        .all(definitionId),
      edges: this.db
        .prepare(
          `
        SELECT e.*, source.node_key AS source_key, target.node_key AS target_key
        FROM process_edge e
        JOIN process_node source ON source.id = e.source_node_id
        JOIN process_node target ON target.id = e.target_node_id
        WHERE e.process_definition_id = ? ORDER BY e.priority DESC, e.id ASC
      `,
        )
        .all(definitionId),
    };
  }

  startNode(definitionId) {
    return this.db
      .prepare("SELECT * FROM process_node WHERE process_definition_id = ? AND node_type = 'START'")
      .get(definitionId);
  }

  node(id) {
    return this.db.prepare('SELECT * FROM process_node WHERE id = ?').get(id);
  }
  outgoingEdges(nodeId) {
    return this.db
      .prepare('SELECT * FROM process_edge WHERE source_node_id = ? ORDER BY priority DESC, id ASC')
      .all(nodeId);
  }
  incomingCount(nodeId) {
    return Number(
      this.db.prepare('SELECT COUNT(*) AS count FROM process_edge WHERE target_node_id = ?').get(nodeId).count,
    );
  }

  insertInstance(definitionId, businessKey, parentInstanceId = null) {
    const result = this.db
      .prepare(
        `
      INSERT INTO process_instance(process_definition_id, business_key, parent_instance_id)
      VALUES (?, ?, ?)
    `,
      )
      .run(definitionId, businessKey ?? null, parentInstanceId);
    return Number(result.lastInsertRowid);
  }

  instance(id) {
    return this.db.prepare('SELECT * FROM process_instance WHERE id = ?').get(id);
  }
  updateInstanceStatus(id, status, ended = false) {
    this.db
      .prepare(
        `UPDATE process_instance SET status = ?, ended_at = ${ended ? 'CURRENT_TIMESTAMP' : 'NULL'} WHERE id = ?`,
      )
      .run(status, id);
  }
  listInstances({ status, processKey, businessKey, limit = 100 }) {
    const clauses = [];
    const params = [];
    if (status) {
      clauses.push('i.status = ?');
      params.push(status);
    }
    if (processKey) {
      clauses.push('d.process_key = ?');
      params.push(processKey);
    }
    if (businessKey) {
      clauses.push('i.business_key = ?');
      params.push(businessKey);
    }
    params.push(Math.min(Math.max(limit, 1), 500));
    return this.db
      .prepare(
        `
      SELECT i.*, d.process_key, d.name AS process_name, d.version,
        (
          SELECT COUNT(*)
          FROM process_node step
          WHERE step.process_definition_id = i.process_definition_id
            AND step.node_type NOT IN ('START', 'END')
        ) AS definition_step_count,
        (
          SELECT COUNT(DISTINCT event.node_id)
          FROM history_event event
          JOIN process_node step ON step.id = event.node_id
          WHERE event.process_instance_id = i.id
            AND event.event_type = 'NODE_COMPLETED'
            AND step.node_type NOT IN ('START', 'END')
        ) AS completed_step_count
      FROM process_instance i JOIN process_definition d ON d.id = i.process_definition_id
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY i.id DESC LIMIT ?
    `,
      )
      .all(...params);
  }

  insertToken(instanceId, nodeId, parentTokenId = null) {
    const result = this.db
      .prepare(
        `
      INSERT INTO token(process_instance_id, node_id, parent_token_id) VALUES (?, ?, ?)
    `,
      )
      .run(instanceId, nodeId, parentTokenId);
    return Number(result.lastInsertRowid);
  }
  token(id) {
    return this.db.prepare('SELECT * FROM token WHERE id = ?').get(id);
  }
  moveToken(id, nodeId) {
    this.db.prepare("UPDATE token SET node_id = ?, state = 'ACTIVE' WHERE id = ?").run(nodeId, id);
  }
  setTokenState(id, state) {
    this.db
      .prepare(
        `UPDATE token SET state = ?, completed_at = ${state === 'COMPLETED' ? 'CURRENT_TIMESTAMP' : 'NULL'} WHERE id = ?`,
      )
      .run(state, id);
  }
  activeTokenCount(instanceId) {
    return Number(
      this.db
        .prepare("SELECT COUNT(*) AS count FROM token WHERE process_instance_id = ? AND state IN ('ACTIVE','WAITING')")
        .get(instanceId).count,
    );
  }
  waitingTokensAt(instanceId, nodeId) {
    return this.db
      .prepare("SELECT * FROM token WHERE process_instance_id = ? AND node_id = ? AND state = 'WAITING' ORDER BY id")
      .all(instanceId, nodeId);
  }
  tokensForInstance(instanceId) {
    return this.db
      .prepare(
        `
      SELECT t.*, n.node_key, n.name AS node_name, n.node_type
      FROM token t JOIN process_node n ON n.id = t.node_id
      WHERE t.process_instance_id = ? ORDER BY t.id
    `,
      )
      .all(instanceId);
  }
  cancelTokens(instanceId) {
    this.db
      .prepare(
        "UPDATE token SET state = 'CANCELLED', completed_at = CURRENT_TIMESTAMP WHERE process_instance_id = ? AND state IN ('ACTIVE','WAITING')",
      )
      .run(instanceId);
  }

  variables(instanceId) {
    const rows = this.db.prepare('SELECT name, value_json FROM variable WHERE process_instance_id = ?').all(instanceId);
    return Object.fromEntries(rows.map((row) => [row.name, JSON.parse(row.value_json)]));
  }
  upsertVariables(instanceId, values) {
    const statement = this.db.prepare(`
      INSERT INTO variable(process_instance_id, name, value_type, value_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(process_instance_id, name) DO UPDATE SET
        value_type = excluded.value_type, value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
    `);
    for (const [name, value] of Object.entries(values || {})) {
      statement.run(instanceId, name, variableType(value), JSON.stringify(value));
    }
  }

  activeTaskFor(tokenId, nodeId) {
    return this.db
      .prepare(
        "SELECT * FROM task WHERE token_id = ? AND node_id = ? AND status IN ('CREATED','CLAIMED') ORDER BY id DESC LIMIT 1",
      )
      .get(tokenId, nodeId);
  }
  insertTask(token, node, config) {
    const result = this.db
      .prepare(
        `
      INSERT INTO task(process_instance_id, token_id, node_id, task_key, name, assignee, candidate_group, priority, due_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        token.process_instance_id,
        token.id,
        node.id,
        node.node_key,
        node.name || node.node_key,
        config.assignee ?? null,
        config.candidateGroup ?? null,
        config.priority ?? 50,
        config.dueAt ?? null,
      );
    return Number(result.lastInsertRowid);
  }
  task(id) {
    return this.db.prepare('SELECT * FROM task WHERE id = ?').get(id);
  }
  claimTask(id, assignee) {
    return this.db
      .prepare(
        `
      UPDATE task SET status = 'CLAIMED', assignee = ?, claimed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'CREATED'
    `,
      )
      .run(assignee, id).changes;
  }
  completeTask(id) {
    return this.db
      .prepare(
        `
      UPDATE task SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status IN ('CREATED','CLAIMED')
    `,
      )
      .run(id).changes;
  }
  listTasks({ status, assignee, candidateGroup, instanceId, limit = 100 }) {
    const clauses = [],
      params = [];
    if (status) {
      clauses.push('t.status = ?');
      params.push(status);
    }
    if (assignee) {
      clauses.push('t.assignee = ?');
      params.push(assignee);
    }
    if (candidateGroup) {
      clauses.push('t.candidate_group = ?');
      params.push(candidateGroup);
    }
    if (instanceId) {
      clauses.push('t.process_instance_id = ?');
      params.push(instanceId);
    }
    params.push(Math.min(Math.max(limit, 1), 500));
    return this.db
      .prepare(
        `
      SELECT t.*, n.node_key, i.business_key, d.process_key
      FROM task t JOIN process_node n ON n.id = t.node_id
      JOIN process_instance i ON i.id = t.process_instance_id
      JOIN process_definition d ON d.id = i.process_definition_id
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY t.priority DESC, t.id ASC LIMIT ?
    `,
      )
      .all(...params);
  }
  cancelTasks(instanceId) {
    this.db
      .prepare(
        "UPDATE task SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP WHERE process_instance_id = ? AND status IN ('CREATED','CLAIMED')",
      )
      .run(instanceId);
  }

  activeJobFor(tokenId, nodeId) {
    return this.db
      .prepare(
        "SELECT * FROM job WHERE token_id = ? AND node_id = ? AND status IN ('READY','RUNNING') ORDER BY id DESC LIMIT 1",
      )
      .get(tokenId, nodeId);
  }
  insertJob(token, node, type, payload, retries, dueAt) {
    const result = this.db
      .prepare(
        `
      INSERT INTO job(process_instance_id, token_id, node_id, job_type, payload_json, retries, due_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(token.process_instance_id, token.id, node.id, type, JSON.stringify(payload), retries, dueAt);
    return Number(result.lastInsertRowid);
  }
  job(id) {
    return this.db.prepare('SELECT * FROM job WHERE id = ?').get(id);
  }
  readyServiceJobs(workerTypes, limit, now) {
    const filter = workerTypes?.length
      ? `AND json_extract(j.payload_json, '$.workerType') IN (${placeholders(workerTypes)})`
      : '';
    return this.db
      .prepare(
        `
      SELECT j.* FROM job j JOIN process_instance i ON i.id = j.process_instance_id
      WHERE j.status = 'READY' AND j.job_type = 'SERVICE_TASK'
        AND (j.due_at IS NULL OR j.due_at <= ?) AND i.status = 'RUNNING' ${filter}
      ORDER BY COALESCE(j.due_at, j.created_at), j.id LIMIT ?
    `,
      )
      .all(now, ...(workerTypes || []), limit);
  }
  claimJob(id, workerId, lockedUntil) {
    return this.db
      .prepare(
        `
      UPDATE job SET status = 'RUNNING', locked_by = ?, locked_until = ?
      WHERE id = ? AND status = 'READY'
    `,
      )
      .run(workerId, lockedUntil, id).changes;
  }
  completeJob(id) {
    this.db
      .prepare(
        "UPDATE job SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, locked_by = NULL, locked_until = NULL WHERE id = ?",
      )
      .run(id);
  }
  retryJob(id, retries, dueAt, error = null) {
    this.db
      .prepare(
        "UPDATE job SET status = 'READY', retries = ?, due_at = ?, last_error = ?, locked_by = NULL, locked_until = NULL WHERE id = ?",
      )
      .run(retries, dueAt, error, id);
  }
  deadJob(id, error) {
    this.db
      .prepare(
        "UPDATE job SET status = 'DEAD', retries = 0, last_error = ?, locked_by = NULL, locked_until = NULL WHERE id = ?",
      )
      .run(error, id);
  }
  recoverExpiredJobs(now) {
    return this.db
      .prepare(
        `
      UPDATE job SET status = 'READY', locked_by = NULL, locked_until = NULL,
        last_error = COALESCE(last_error, 'Worker lock expired')
      WHERE status = 'RUNNING' AND locked_until < ?
    `,
      )
      .run(now).changes;
  }
  dueJobs(type, now, limit = 100) {
    return this.db
      .prepare(
        `
      SELECT j.* FROM job j JOIN process_instance i ON i.id = j.process_instance_id
      WHERE j.status = 'READY' AND j.job_type = ? AND (j.due_at IS NULL OR j.due_at <= ?) AND i.status = 'RUNNING'
      ORDER BY COALESCE(j.due_at, j.created_at), j.id LIMIT ?
    `,
      )
      .all(type, now, limit);
  }
  messageJobs() {
    return this.db
      .prepare(
        `
      SELECT j.*, i.business_key FROM job j JOIN process_instance i ON i.id = j.process_instance_id
      WHERE j.status = 'READY' AND j.job_type = 'MESSAGE' AND i.status = 'RUNNING' ORDER BY j.id
    `,
      )
      .all();
  }
  jobsForInstance(instanceId) {
    return this.db.prepare('SELECT * FROM job WHERE process_instance_id = ? ORDER BY id').all(instanceId);
  }
  cancelJobs(instanceId) {
    this.db
      .prepare(
        "UPDATE job SET status = 'DEAD', last_error = 'Process cancelled', locked_by = NULL, locked_until = NULL WHERE process_instance_id = ? AND status IN ('READY','RUNNING','FAILED')",
      )
      .run(instanceId);
  }

  insertIncident({ instanceId, jobId = null, nodeId = null, type, message, details = null }) {
    const result = this.db
      .prepare(
        `
      INSERT INTO incident(process_instance_id, job_id, node_id, incident_type, message, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(instanceId, jobId, nodeId, type, message, details);
    return Number(result.lastInsertRowid);
  }
  incident(id) {
    return this.db.prepare('SELECT * FROM incident WHERE id = ?').get(id);
  }
  resolveIncident(id) {
    return this.db
      .prepare(
        "UPDATE incident SET status = 'RESOLVED', resolved_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'OPEN'",
      )
      .run(id).changes;
  }
  listIncidents(status, instanceId, limit = 100) {
    const clauses = [],
      params = [];
    if (status) {
      clauses.push('status = ?');
      params.push(status);
    }
    if (instanceId) {
      clauses.push('process_instance_id = ?');
      params.push(instanceId);
    }
    params.push(Math.min(Math.max(limit, 1), 500));
    return this.db
      .prepare(
        `SELECT * FROM incident ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`,
      )
      .all(...params);
  }

  history(instanceId, type, limit = 500) {
    const params = [instanceId];
    const filter = type ? 'AND event_type = ?' : '';
    if (type) params.push(type);
    params.push(Math.min(Math.max(limit, 1), 2000));
    return this.db
      .prepare(`SELECT * FROM history_event WHERE process_instance_id = ? ${filter} ORDER BY id ASC LIMIT ?`)
      .all(...params);
  }
  addHistory(instanceId, type, refs = {}, data = {}) {
    this.db
      .prepare(
        `
      INSERT INTO history_event(process_instance_id, node_id, token_id, task_id, job_id, event_type, event_data_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        instanceId,
        refs.nodeId ?? null,
        refs.tokenId ?? null,
        refs.taskId ?? null,
        refs.jobId ?? null,
        type,
        JSON.stringify(data),
      );
  }
}

function variableType(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'string') return 'STRING';
  if (typeof value === 'boolean') return 'BOOLEAN';
  if (typeof value === 'number') return Number.isInteger(value) ? 'INTEGER' : 'REAL';
  return 'JSON';
}
