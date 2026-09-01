# SQLite Workflow Engine Builder

## Purpose

This skill teaches an agent how to design, implement, test, and extend a durable workflow engine backed by SQLite.

The engine should support workflow concepts similar to BPMN engines such as Camunda while remaining significantly simpler and suitable for local applications, embedded systems, desktop applications, development tools, agent orchestration systems, and lightweight servers.

The engine must treat workflows as durable state machines rather than simple sequences of function calls.

A workflow must survive:

* process restarts
* application crashes
* worker crashes
* delayed tasks
* user tasks
* retries
* timers
* parallel execution
* service failures

The database is the source of truth for workflow state.

---

# Core Design Principles

Always separate the system into three conceptual layers:

```text
Workflow Definition
        │
        ▼
Workflow Runtime
        │
        ▼
Workflow History
```

Definitions describe what should happen.

Runtime tables describe what is currently happening.

History describes what already happened.

Never use application memory as the authoritative workflow state.

SQLite must remain capable of reconstructing the current workflow state after the application restarts.

---

# Core Architecture

Use the following architecture:

```text
                     APPLICATION
                         │
                         ▼
                 Workflow Engine
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
 Token Processor     Job Executor     Task Manager
        │                │                │
        └────────────────┼────────────────┘
                         │
                         ▼
                       SQLite
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
 Definitions          Runtime          History
```

The engine should be divided into components rather than implemented as one large workflow function.

Recommended modules:

```text
workflow/
    engine/
        workflow-engine.js
        token-engine.js
        gateway-engine.js
        job-executor.js
        task-manager.js
        variable-manager.js
        incident-manager.js
        history-manager.js

    database/
        database.js
        migrations/
        repositories/

    workers/
        worker-registry.js
        worker-runner.js

    definitions/
        definition-loader.js
        definition-validator.js

    expression/
        expression-engine.js

    tests/
```

Module names may vary, but responsibilities should remain separated.

---

# Database Model

The minimum production-capable schema should include:

```text
process_definition
process_node
process_edge

process_instance
token
variable

task
job

incident
history_event
```

Additional features may introduce:

```text
deployment
message_subscription
timer_subscription
signal_subscription
worker
job_attempt
process_variable_history
task_assignment
form_definition
process_lock
```

Do not add tables without a clear runtime requirement.

---

# Entity Dependency Model

Use this relationship as the default architecture:

```text
PROCESS_DEFINITION
        │
        ├────────────── PROCESS_NODE
        │                    │
        │                    └──────── PROCESS_EDGE
        │
        └────────────── PROCESS_INSTANCE
                              │
             ┌────────────────┼──────────────────┐
             │                │                  │
             ▼                ▼                  ▼
           TOKEN           VARIABLE             TASK
             │                                   │
             │                                   ▼
             └───────────── JOB            TASK_VARIABLE
                              │
                              ▼
                           INCIDENT

PROCESS_INSTANCE
        │
        └──────────────── HISTORY_EVENT
```

A process definition is immutable after deployment.

A new edit should create another version rather than modifying an existing deployed definition.

Example:

```text
order-processing v1
order-processing v2
order-processing v3
```

Running process instances continue using the version under which they were started.

---

# Process Definition

A process definition represents a workflow template.

Example:

```text
Order Approval
version 3
```

Required properties should include:

```text
id
process_key
name
version
status
created_at
```

The combination:

```text
process_key + version
```

must be unique.

Example:

```text
process_key = order-approval
version = 4
```

---

# Nodes

Workflow behavior is represented as nodes.

Initially support:

```text
START
END

USER_TASK
SERVICE_TASK
SCRIPT_TASK

EXCLUSIVE_GATEWAY
PARALLEL_GATEWAY

TIMER
MESSAGE
```

Possible later additions:

```text
INCLUSIVE_GATEWAY
EVENT_BASED_GATEWAY

SUBPROCESS
CALL_ACTIVITY

SIGNAL
BOUNDARY_EVENT
ERROR_EVENT
ESCALATION_EVENT
```

Each node should have a stable logical identifier:

```text
node_key
```

Do not use database IDs inside external workflow definitions.

Example:

```json
{
  "key": "approveOrder",
  "type": "USER_TASK",
  "name": "Approve Order"
}
```

Database IDs are internal implementation details.

---

# Edges

Edges define transitions between nodes.

Example:

```text
START
  │
  ▼
Create Order
  │
  ▼
Check Amount
```

An edge contains:

```text
source_node
target_node
condition
priority
```

Conditional transitions may look like:

```text
amount > 1000
```

or:

```text
approved == true
```

Multiple outgoing edges must be processed deterministically.

Use priority or explicit workflow ordering where necessary.

---

# Process Instances

A process instance represents one execution of a process definition.

Example:

```text
Definition:
Order Processing v4

Instance:
order #A12345
```

Recommended states:

```text
RUNNING
COMPLETED
FAILED
CANCELLED
SUSPENDED
```

A process instance should reference exactly one process definition version.

Allow an optional:

```text
business_key
```

Example:

```text
business_key = ORDER-10492
```

This allows applications to locate workflow instances using domain identifiers.

---

# Tokens

Tokens are the most important runtime concept.

A token represents an active path through the workflow.

Never represent workflow position using only:

```text
process_instance.current_node
```

That approach cannot correctly represent parallel workflows.

Instead:

```text
process_instance
      │
      ├── token → Task A
      │
      └── token → Task B
```

A process can therefore have multiple simultaneously active positions.

Recommended token states:

```text
ACTIVE
WAITING
COMPLETED
CANCELLED
```

A token should contain:

```text
id
process_instance_id
node_id
parent_token_id
state
created_at
completed_at
```

Tokens may form execution trees.

Example:

```text
token 1
   │
   ├── token 2
   │
   └── token 3
```

---

# Basic Execution Model

The engine processes tokens.

The basic algorithm is:

```text
load active token

        │
        ▼

load current node

        │
        ▼

execute behavior for node type

        │
        ▼

create waiting state
OR
find outgoing transition

        │
        ▼

move/create token

        │
        ▼

continue execution
```

Use iterative execution rather than uncontrolled recursive calls.

A workflow containing hundreds of automatic nodes must not overflow the JavaScript or application call stack.

---

# Starting a Workflow

Starting a process should run inside a database transaction.

Algorithm:

```text
BEGIN TRANSACTION

find process definition

create process instance

find START node

create token at START

write PROCESS_STARTED history event

execute token

COMMIT
```

If any database operation fails:

```text
ROLLBACK
```

The process must not become partially started.

---

# Start Node

A START node performs no external work.

Behavior:

```text
START

find outgoing edge

move execution

mark START token completed

continue target node
```

Usually only one outgoing edge should exist.

Validate this when deploying definitions.

---

# End Node

When execution reaches an END node:

```text
mark token completed
```

Then inspect the process instance.

If no active or waiting tokens remain:

```text
process_instance.status = COMPLETED
process_instance.ended_at = current time
```

Write:

```text
PROCESS_COMPLETED
```

to history.

Do not mark the process complete merely because one token reaches an END event.

Parallel branches may still be executing.

---

# User Tasks

A USER_TASK pauses workflow execution.

Example:

```text
START
  │
  ▼
Approve Invoice
  │
 waits
```

When entered:

```text
create task

token.state = WAITING
```

Task fields should include:

```text
name
assignee
candidate_group
priority
created_at
claimed_at
completed_at
due_at
status
```

Recommended states:

```text
CREATED
CLAIMED
COMPLETED
CANCELLED
```

Completing a task should execute inside a transaction.

Algorithm:

```text
BEGIN

validate task status

apply output variables

task.status = COMPLETED

token.state = ACTIVE

write TASK_COMPLETED history

move token through outgoing transition

COMMIT
```

Task completion must be idempotent where possible.

A task that has already completed should not accidentally move workflow execution twice.

---

# Service Tasks

A SERVICE_TASK normally represents external or application work.

Examples:

```text
sendEmail

chargeCreditCard

generateInvoice

callApi

runAgent

updateCRM
```

Do not normally execute long-running external work while holding a SQLite transaction.

Instead create a job.

```text
SERVICE_TASK
      │
      ▼
    JOB
      │
      ▼
   Worker
```

When the workflow reaches a service task:

```text
create job
token.state = WAITING
```

A worker later executes the job.

---

# Jobs

Jobs provide asynchronous durable execution.

A job should include:

```text
id
process_instance_id
token_id
node_id

job_type
status

payload_json

retries

due_at

locked_by
locked_until

last_error

created_at
completed_at
```

Recommended job states:

```text
READY
RUNNING
COMPLETED
FAILED
DEAD
```

---

# Job Worker Model

Workers should repeatedly look for executable jobs.

Logical loop:

```text
find READY job
        │
        ▼
claim job
        │
        ▼
execute handler
        │
    success?
     /     \
   yes      no
   │         │
   ▼         ▼
complete   retry
job        or incident
```

Worker handlers can be registered by task type.

Example:

```javascript
engine.registerWorker("sendEmail", async context => {
    // perform work
});
```

Workflow configuration could contain:

```json
{
  "type": "SERVICE_TASK",
  "workerType": "sendEmail"
}
```

Do not store executable JavaScript functions in SQLite.

Store declarative identifiers such as:

```text
sendEmail
payment.charge
agent.research
invoice.generate
```

Resolve them through a runtime worker registry.

---

# Job Locking

Workers must claim jobs before executing them.

Even with SQLite, locking semantics matter because multiple worker processes or threads may exist.

Recommended job fields:

```text
locked_by
locked_until
```

Conceptually:

```sql
UPDATE job
SET
    status = 'RUNNING',
    locked_by = ?,
    locked_until = ?
WHERE
    id = ?
    AND status = 'READY';
```

The worker must verify that exactly one row was updated.

Use short transactions for claiming jobs.

Do not keep a SQLite write transaction open while calling an HTTP API or performing expensive computation.

---

# Job Completion

On successful service execution:

```text
BEGIN

verify worker owns job

job.status = COMPLETED

save output variables

token.state = ACTIVE

write JOB_COMPLETED history

move token

COMMIT
```

External side effects and database transactions cannot normally be made atomically.

Therefore workers should prefer idempotent external operations.

Use idempotency keys where supported.

Example:

```text
workflow-job-72819
```

---

# Job Failure and Retries

When a worker fails:

```text
retries = retries - 1
last_error = error message
```

If retries remain:

```text
status = READY
due_at = retry time
```

Otherwise:

```text
status = DEAD
```

and create an incident.

Recommended retry strategy:

```text
attempt 1 → +5 seconds
attempt 2 → +30 seconds
attempt 3 → +5 minutes
attempt 4 → incident
```

Retry timing should be configurable.

---

# Incidents

Incidents represent workflow problems requiring attention.

Examples:

```text
service task failed permanently
invalid expression
missing worker
unexpected gateway state
malformed workflow data
```

Recommended fields:

```text
incident_type
message
details
status
created_at
resolved_at
```

Incident states:

```text
OPEN
RESOLVED
```

The engine should not destroy runtime state when an incident occurs.

Operators must be able to inspect and potentially retry failed workflow execution.

---

# Variables

Workflow variables store application state associated with a process instance.

Example:

```json
{
  "customerId": 9182,
  "amount": 3499,
  "approved": true
}
```

Variables should not require schema modifications whenever new workflow fields are introduced.

Use:

```text
name
value_type
value_json
```

Recommended value types:

```text
STRING
INTEGER
REAL
BOOLEAN
JSON
NULL
```

SQLite JSON functionality may be used when available.

Avoid storing the entire process state in a single giant JSON record if individual values need to be queried or updated independently.

A hybrid approach is acceptable.

---

# Variable Scope

Initial implementation may support only process-level variables.

Later introduce scopes:

```text
PROCESS
TOKEN
TASK
SUBPROCESS
```

A scoped variable model can contain:

```text
scope_type
scope_id
name
value
```

Do not add scope complexity until necessary.

---

# Exclusive Gateways

An exclusive gateway chooses one outgoing transition.

Example:

```text
             amount > 1000
             ┌──────────────► Manager Approval
             │
      ┌──────┴─────┐
─────►│  Gateway   │
      └──────┬─────┘
             │
             └──────────────► Auto Approve
                 otherwise
```

Algorithm:

```text
load outgoing edges

evaluate conditions

select first matching edge

move token
```

There should normally be:

```text
0 or 1 matching conditional path
```

Support a default path.

If multiple mutually exclusive conditions match unexpectedly, either:

```text
use explicit priority
```

or produce an incident.

Never depend on undefined database row ordering.

---

# Expression Engine

Expressions should be deliberately constrained.

Example expressions:

```text
amount > 1000

approved == true

country == "US"

order.total >= 500
```

Do not use unrestricted runtime `eval()` with untrusted expressions.

Implement or use a safe expression evaluator.

Expressions should have read-only access to workflow variables by default.

---

# Parallel Gateways

Parallel gateways require token splitting and joining.

Split example:

```text
                 ┌──── Task A
                 │
START → PARALLEL ┤
                 │
                 └──── Task B
```

At a parallel split:

```text
one incoming token
```

becomes:

```text
token A
token B
```

Each outgoing path must execute independently.

---

# Parallel Join

Example:

```text
Task A ──────┐
             │
             ▼
          PARALLEL → END
             ▲
             │
Task B ──────┘
```

The join must wait until all expected incoming branches arrive.

Do not simply continue when the first token reaches the gateway.

Conceptually:

```text
expected incoming branches = 2

arrived tokens = 1
→ wait

arrived tokens = 2
→ consume waiting tokens
→ create one outgoing continuation
```

Joining must happen transactionally to prevent duplicate continuation.

---

# Timers

Timers should be implemented as jobs.

Example:

```text
Wait 24 Hours
```

Create:

```text
job_type = TIMER
due_at = current time + 24 hours
```

The worker scheduler selects only timers where:

```text
due_at <= current time
```

Never use application-only `setTimeout()` as the sole timer mechanism.

A timer must survive application restarts.

---

# Messages

Message events allow workflows to wait for external events.

Example:

```text
Wait for payment confirmation
```

Recommended future table:

```text
message_subscription
```

Fields:

```text
id
process_instance_id
token_id
message_name
correlation_key
status
created_at
```

External code can publish:

```text
message_name = paymentReceived
correlation_key = ORDER-123
```

The engine locates the subscription and resumes the token.

Message consumption must be idempotent.

---

# History

Every meaningful workflow lifecycle action should generate a history event.

Examples:

```text
PROCESS_STARTED

NODE_ENTERED
NODE_COMPLETED

TOKEN_CREATED
TOKEN_COMPLETED

TASK_CREATED
TASK_CLAIMED
TASK_COMPLETED

JOB_CREATED
JOB_STARTED
JOB_COMPLETED
JOB_FAILED

VARIABLE_CREATED
VARIABLE_UPDATED

INCIDENT_CREATED
INCIDENT_RESOLVED

PROCESS_COMPLETED
PROCESS_CANCELLED
```

History should be append-oriented.

Avoid rewriting old history events.

History allows debugging questions such as:

```text
Why is this workflow waiting?

Which worker failed?

Who approved the task?

When did this process start?

Which route did the gateway choose?
```

---

# Transaction Boundaries

Transaction design is critical.

Use transactions around state transitions.

Good transaction:

```text
BEGIN

complete current token
create next token
create task
write history

COMMIT
```

Bad transaction:

```text
BEGIN

update workflow

call HTTP API

wait 15 seconds

update job

COMMIT
```

Never keep database locks open around slow external operations.

The rule should be:

```text
Database transaction
→ persist work to perform
→ commit
→ external work
→ new transaction
→ persist result
```

---

# SQLite Configuration

On initialization, enable foreign keys.

```sql
PRAGMA foreign_keys = ON;
```

For applications with concurrent readers and a workflow worker, consider:

```sql
PRAGMA journal_mode = WAL;
```

Configure an appropriate busy timeout.

Example:

```sql
PRAGMA busy_timeout = 5000;
```

Use transactions deliberately.

SQLite supports many readers but still has constrained write concurrency.

Design around short writes rather than attempting to use SQLite like a distributed high-write database.

---

# Repository Layer

Database queries should live behind repository modules.

Example:

```text
ProcessDefinitionRepository

ProcessInstanceRepository

TokenRepository

TaskRepository

JobRepository

VariableRepository

IncidentRepository

HistoryRepository
```

Avoid scattering raw SQL throughout workflow execution logic.

Example interface:

```javascript
class JobRepository {
    findReadyJobs() {}

    claimJob() {}

    completeJob() {}

    failJob() {}
}
```

Repositories should contain persistence logic.

Engine modules should contain workflow behavior.

---

# Workflow Definition Format

Do not require BPMN XML for the first implementation.

Use JSON definitions initially.

Example:

```json
{
  "key": "orderApproval",
  "name": "Order Approval",
  "nodes": [
    {
      "key": "start",
      "type": "START"
    },
    {
      "key": "review",
      "type": "USER_TASK",
      "name": "Review Order"
    },
    {
      "key": "amountGateway",
      "type": "EXCLUSIVE_GATEWAY"
    },
    {
      "key": "charge",
      "type": "SERVICE_TASK",
      "workerType": "payment.charge"
    },
    {
      "key": "end",
      "type": "END"
    }
  ],
  "edges": [
    {
      "from": "start",
      "to": "review"
    },
    {
      "from": "review",
      "to": "amountGateway"
    },
    {
      "from": "amountGateway",
      "to": "charge",
      "condition": "approved == true"
    },
    {
      "from": "charge",
      "to": "end"
    }
  ]
}
```

BPMN XML importing can be implemented later.

---

# Definition Validation

Validate definitions before storing them.

At minimum validate:

```text
process key exists

node keys are unique

START exists

END exists

edges reference valid nodes

START has valid outgoing transitions

END does not unexpectedly have outgoing transitions

service tasks define worker types

gateway conditions are valid

all reachable nodes can be traversed
```

Also detect unreachable nodes where practical.

Invalid definitions should fail deployment rather than fail later during execution.

---

# Definition Deployment

Deployment should:

```text
BEGIN

determine next version

insert process_definition

insert nodes

insert edges

validate stored graph

COMMIT
```

Never overwrite a previous deployed workflow version.

Example:

```text
invoiceApproval v1
invoiceApproval v2
invoiceApproval v3
```

Starting:

```javascript
engine.startProcess("invoiceApproval")
```

should normally use the latest active version.

Allow explicit versions when needed.

---

# Workflow Engine Public API

A useful initial API is:

```javascript
engine.deploy(definition);

engine.startProcess(processKey, variables);

engine.getProcessInstance(id);

engine.cancelProcess(id);

engine.getTasks(query);

engine.claimTask(taskId, userId);

engine.completeTask(taskId, variables);

engine.registerWorker(workerType, handler);

engine.runJobs();

engine.retryJob(jobId);

engine.resolveIncident(incidentId);
```

Later add:

```javascript
engine.publishMessage();

engine.signal();

engine.suspendProcess();

engine.resumeProcess();

engine.migrateProcessInstance();
```

---

# Engine Processing Algorithm

The central engine should conceptually operate like:

```javascript
async function executeToken(tokenId) {
    while (true) {
        const token = loadToken(tokenId);

        if (token.state !== "ACTIVE") {
            return;
        }

        const node = loadNode(token.nodeId);

        switch (node.type) {
            case "START":
                moveToNextNode(token);
                break;

            case "END":
                completeToken(token);
                checkProcessCompletion(token.processInstanceId);
                return;

            case "USER_TASK":
                createUserTask(token, node);
                markTokenWaiting(token);
                return;

            case "SERVICE_TASK":
                createJob(token, node);
                markTokenWaiting(token);
                return;

            case "EXCLUSIVE_GATEWAY":
                evaluateExclusiveGateway(token, node);
                break;

            case "PARALLEL_GATEWAY":
                handleParallelGateway(token, node);
                return;

            case "TIMER":
                createTimerJob(token, node);
                markTokenWaiting(token);
                return;

            default:
                throw new Error("Unsupported node type");
        }
    }
}
```

Actual implementation should carefully wrap state transitions in transactions.

---

# Avoiding Duplicate Execution

Workflow engines must assume operations may occasionally be retried.

Design critical operations to be idempotent.

Examples:

```text
complete task once

claim job once

resume token once

consume message once

complete parallel join once
```

Use:

```text
unique constraints

state checks

conditional UPDATE statements

transactions
```

Example:

```sql
UPDATE task
SET status = 'COMPLETED'
WHERE id = ?
AND status IN ('CREATED', 'CLAIMED');
```

Verify affected row count.

If zero rows changed, another operation may already have completed the task.

---

# Crash Recovery

Every waiting operation must be persisted.

After restarting the application, the engine should be able to discover:

```text
READY jobs

expired job locks

waiting timers

open incidents

waiting user tasks

active process instances
```

Never require reconstructed state from in-memory JavaScript objects.

---

# Worker Crash Recovery

If a worker crashes after claiming a job:

```text
locked_until
```

eventually expires.

A recovery process can move expired jobs back to:

```text
READY
```

or allow another worker to reclaim them.

Example:

```text
RUNNING
locked_until < now
```

means:

```text
worker likely died
```

The job may be retried.

Because the external operation might already have happened, idempotency is important.

---

# Process Cancellation

Cancelling a process should:

```text
BEGIN

process status = CANCELLED

cancel active tokens

cancel waiting tasks

cancel pending jobs

remove subscriptions if applicable

write PROCESS_CANCELLED history

COMMIT
```

Do not delete the workflow instance.

History should remain inspectable.

---

# Suspension

Suspension differs from cancellation.

A suspended process remains valid but should stop advancing.

Recommended semantics:

```text
process_instance.status = SUSPENDED
```

Workers should not acquire jobs for suspended process instances.

Tasks may remain visible depending on application requirements.

Resuming changes status back to:

```text
RUNNING
```

---

# Error Handling

Distinguish between:

```text
expected business errors

technical errors

engine errors
```

Examples:

Business error:

```text
payment declined
```

Technical error:

```text
payment service timeout
```

Engine error:

```text
workflow references missing node
```

Do not treat every exception identically.

Business errors may eventually support explicit workflow error transitions.

Technical errors usually trigger retries.

Engine errors usually produce incidents.

---

# Logging

Every runtime operation should use structured logging.

Include identifiers such as:

```text
processDefinitionId
processInstanceId
tokenId
nodeId
taskId
jobId
workerId
```

Example:

```json
{
  "event": "job.failed",
  "processInstanceId": 812,
  "jobId": 3019,
  "workerType": "payment.charge",
  "attempt": 3
}
```

Never rely only on console text for operational diagnostics.

---

# Security

Do not execute arbitrary code contained in workflow definitions.

Avoid:

```javascript
eval(expression)
```

Avoid loading arbitrary JavaScript module names directly from user-controlled workflow definitions.

Use allowlisted worker registrations.

Example:

```javascript
workerRegistry.register("payment.charge", chargePayment);
```

Validate workflow JSON before deployment.

Use parameterized SQL everywhere.

Never concatenate workflow values into SQL statements.

---

# Testing Strategy

Workflow engines require more than unit tests.

Create tests at several levels.

Unit tests:

```text
expression evaluation

gateway routing

variable serialization

retry calculations
```

Integration tests:

```text
deploy process

start process

complete user task

execute service task

complete process
```

Crash recovery tests:

```text
start workflow

create job

simulate process restart

reload database

continue workflow
```

Concurrency tests:

```text
two workers attempt same job

two requests complete same task

parallel branches arrive simultaneously
```

Failure tests:

```text
worker throws error

database transaction fails

invalid gateway expression

missing registered worker
```

---

# Required Workflow Test Cases

Every implementation should include workflows covering:

### Straight-through workflow

```text
START
  ↓
SERVICE TASK
  ↓
END
```

### User task

```text
START
  ↓
USER TASK
  ↓
END
```

### Exclusive gateway

```text
           ┌── Task A
START → X ─┤
           └── Task B
```

### Parallel workflow

```text
          ┌── Task A ──┐
START → +              + → END
          └── Task B ──┘
```

### Service retry

```text
START
  ↓
Failing Service
  ↓
retry
  ↓
success
  ↓
END
```

### Incident

```text
START
  ↓
Service
  ↓
fail
  ↓
fail
  ↓
fail
  ↓
INCIDENT
```

### Timer

```text
START
  ↓
WAIT 10 SECONDS
  ↓
END
```

---

# Migration Strategy

Database schema changes must use migrations.

Never silently modify production schemas during normal engine execution.

Example:

```text
001_initial_schema.sql
002_add_job_locking.sql
003_add_message_subscriptions.sql
004_add_task_candidate_groups.sql
```

Keep a migration table:

```text
schema_migration
```

containing applied versions.

---

# Suggested Implementation Order

Build the engine in this order:

1. SQLite schema and migrations.
2. Repository layer.
3. Workflow JSON deployment.
4. Definition validation.
5. Process instance creation.
6. Token execution.
7. START and END nodes.
8. User tasks.
9. Variables.
10. Service jobs.
11. Worker registry.
12. Retry handling.
13. Incidents.
14. Exclusive gateways.
15. Parallel gateways.
16. Timers.
17. History.
18. Crash recovery.
19. Messages.
20. Subprocesses and advanced BPMN functionality.

Do not begin with advanced BPMN features.

First make durable basic execution extremely reliable.

---

# Recommended MVP

The first usable version should support:

```text
START

END

USER_TASK

SERVICE_TASK

EXCLUSIVE_GATEWAY

PARALLEL_GATEWAY
```

plus:

```text
variables

jobs

workers

retries

incidents

history
```

This is enough to implement many real workflows.

---

# Example Runtime

Given:

```text
START
  │
  ▼
Create Request
  │
  ▼
Approve Request
  │
  ▼
Send Email
  │
  ▼
END
```

starting the workflow might create:

```text
process_instance #1001

token #501
```

At:

```text
Approve Request
```

runtime state becomes:

```text
process_instance #1001
    RUNNING

token #501
    WAITING

task #782
    CREATED
```

After completing the task:

```text
task #782
    COMPLETED
```

the token reaches:

```text
Send Email
```

and runtime becomes:

```text
token #501
    WAITING

job #901
    READY
```

Worker executes:

```text
job #901
    COMPLETED
```

Token moves to:

```text
END
```

Final state:

```text
process_instance #1001
    COMPLETED
```

History remains available for the entire lifecycle.

---

# Things the Agent Must Never Do

Never implement workflow execution as only:

```javascript
await task1();
await task2();
await task3();
```

This is orchestration code, not a durable workflow engine.

Never store workflow position only in memory.

Never modify deployed workflow definitions in place.

Never perform external network operations while holding long SQLite write transactions.

Never use arbitrary `eval()` on workflow expressions.

Never assume jobs execute exactly once.

Never assume workers cannot crash.

Never assume a workflow has only one active execution path.

Never delete runtime state merely because something failed.

Never use database row ordering as workflow transition ordering.

Never ignore affected-row counts for concurrency-sensitive updates.

---

# Design Philosophy

Think of the workflow engine as a persistent state machine.

The fundamental relationship is:

```text
Definition
     │
     ▼
Instance
     │
     ▼
Token
     │
     ▼
Node
     │
     ├── immediately continue
     │
     ├── create task and wait
     │
     ├── create job and wait
     │
     ├── split into tokens
     │
     └── finish
```

Everything else is infrastructure around this state transition model.

When uncertain about implementation decisions, prefer:

```text
durability

transaction safety

idempotency

explicit state

inspectability

simple behavior

recoverability
```

over clever abstractions.

The engine should always be able to answer:

```text
What workflows exist?

Which workflows are currently running?

Where is each workflow waiting?

Why is it waiting?

What happened previously?

What needs to execute next?

What failed?

Can execution safely resume?
```

If the database can answer those questions after the application has completely restarted, the architecture is moving in the right direction.
