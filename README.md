# SQLite Workflow MCP Server

A durable, Camunda-like workflow engine backed by SQLite and exposed through the MCP Streamable HTTP transport. SQLite is the source of truth: process definitions, instances, tokens, variables, tasks, jobs, incidents, and history survive server restarts.

## Run

Requires Node.js 24 or newer (the engine uses the built-in `node:sqlite` module).

```bash
npm install
npm start
```

Open the web application at `http://127.0.0.1:8080/`. Accounts are stored in the workflow SQLite database and sessions use HTTP-only cookies. Existing accounts in `db/users.json` are imported automatically. The dashboard exposes workflow definitions, requests, and human tasks through authenticated JSON APIs.

The `/chat` page includes streamed model responses, persistent conversation history, image input,
prompt history, stoppable runs, and persisted step summaries. Chat sessions,
messages, and runs are stored in the same SQLite database and every query is scoped to the signed-in
user. The chat agent has no filesystem, command, HTTP, skill, workspace, provider-management, or
general-purpose tool access. Its only tool surface is the built-in workflow MCP registry, fixed to
the server label `workflow`.

Copy `.env.example` to `.env` and configure the model before using chat:

```bash
CHAT_LLM_MODEL=gpt-5.1
CHAT_LLM_API_KEY=your-key
CHAT_LLM_BASE_URL=https://api.openai.com/v1
CHAT_SYSTEM_PROMPT="You are Flow, a workflow operations assistant. For every requested graphic, picture, image, diagram, chart, plot, graph, map, or other visual, return a self-contained SVG in a fenced svg code block."
CHAT_MAX_TOOL_TURNS=12
```

`CHAT_LLM_BASE_URL` may point to any provider implementing the OpenAI-compatible Responses API.
The API key is optional for local endpoints that do not require authentication. Configuration is
environment-only and is not exposed or persisted in the UI. Existing shell variables take
precedence over values loaded from `.env`.

The workflow MCP endpoint remains available through the engine module at:

- MCP: `http://127.0.0.1:8081/mcp` (when running `npm run start:mcp`)
- MCP health: `http://127.0.0.1:8081/health`
- SQLite: `db/workflow.db`

Configuration:

```bash
HOST=127.0.0.1 PORT=8081 WORKFLOW_DB_PATH=./db/workflow.db npm run start:mcp
```

The server is intentionally bound to loopback by default and has no authentication. Add an authentication gateway before exposing it on a network.

Example MCP client configuration:

```json
{
  "mcpServers": {
    "workflow": {
      "url": "http://127.0.0.1:8081/mcp"
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
