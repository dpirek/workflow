# SQLite Workflow MCP Server

A durable, Camunda-like workflow engine backed by SQLite and exposed through the MCP Streamable HTTP transport. SQLite is the source of truth: process definitions, instances, tokens, variables, tasks, jobs, incidents, and history survive server restarts.

## Run

Requires Node.js 24 or newer (the engine uses the built-in `node:sqlite` module).

```bash
npm install
npm start
```

Open the web application at `http://127.0.0.1:8080/`. Accounts are stored in `db/users.json` and sessions use HTTP-only cookies. The dashboard exposes workflow definitions, requests, and human tasks through authenticated JSON APIs.

The workflow MCP endpoint remains available through the engine module at:

- MCP: `http://127.0.0.1:3000/mcp` (when running `workflow/index.js`)
- Health: `http://127.0.0.1:8080/health`
- SQLite: `db/workflow.db`

Configuration:

```bash
HOST=127.0.0.1 PORT=3000 WORKFLOW_DB_PATH=./db/workflow.db npm start
```

The server is intentionally bound to loopback by default and has no authentication. Add an authentication gateway before exposing it on a network.

Example MCP client configuration:

```json
{
  "mcpServers": {
    "workflow": {
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

## Definition format

Definitions are JSON and immutable after deployment. Deploying the same key creates the next version.

```json
{
  "key": "order-approval",
  "name": "Order Approval",
  "nodes": [
    { "key": "start", "type": "START" },
    { "key": "review", "type": "USER_TASK", "name": "Review order" },
    { "key": "approved", "type": "EXCLUSIVE_GATEWAY" },
    { "key": "notify", "type": "SERVICE_TASK", "workerType": "email.send", "retries": 3 },
    { "key": "end", "type": "END" }
  ],
  "edges": [
    { "from": "start", "to": "review" },
    { "from": "review", "to": "approved" },
    { "from": "approved", "to": "notify", "condition": "approved == true", "priority": 10 },
    { "from": "approved", "to": "end" },
    { "from": "notify", "to": "end" }
  ]
}
```

Supported node types: `START`, `END`, `USER_TASK`, `SERVICE_TASK`, `SCRIPT_TASK` (external worker), `EXCLUSIVE_GATEWAY`, `PARALLEL_GATEWAY`, `TIMER`, and `MESSAGE`.

## MCP tools

- Definitions: `deploy_workflow`, `list_workflows`, `get_workflow`
- Instances: `start_process`, `get_process_instance`, `list_process_instances`, `set_variables`, `cancel_process`
- Human work: `list_tasks`, `claim_task`, `complete_task`
- External workers: `fetch_and_lock_jobs`, `complete_job`, `fail_job`, `retry_job`
- Events and operations: `run_due_timers`, `publish_message`, `list_incidents`, `resolve_incident`, `get_history`

Service work follows the external-task pattern: a worker calls `fetch_and_lock_jobs`, performs the external side effect without holding a database transaction, then calls `complete_job` or `fail_job`. Workers should use the job ID as an idempotency key for external systems.

Timer jobs are durable but require a caller or scheduler to invoke `run_due_timers`. Message nodes use their configured `messageName` and either the named process variable in `correlationKey` or the process business key.

## Verify

```bash
npm run check
npm test
```

The tests cover task and job execution, exclusive routing, parallel split/join, retries and incidents, timers, messages, and a real MCP client over Streamable HTTP.
