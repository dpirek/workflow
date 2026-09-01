# Web Workflow Application Builder

## Purpose

This skill teaches an agent how to design and build a web application around a durable SQLite workflow engine inspired by systems such as Camunda.

The application should support the complete workflow lifecycle:

- workflow design
- workflow deployment
- process execution
- human tasks
- asynchronous jobs
- retries
- incidents
- runtime monitoring
- history and audit
- process variables
- worker management

The workflow engine and SQLite database are the authoritative runtime system.

The web application provides design, administration, operations, and human-task interfaces on top of that engine.

---

# Product Architecture

Organize the application into these major artifacts:

```text
WEB APPLICATION
│
├── Workflow Designer
├── Workflow Management
├── Process Runtime
├── Human Task Application
├── Jobs and Workers
├── Incident Management
├── History and Audit
├── Variables Inspector
├── Backend API
├── Workflow Engine
└── SQLite Database
```

The high-level system architecture should be:

```text
Browser
   │
   │ HTTP / WebSocket
   ▼
Web API
   │
   ▼
Application Services
   │
   ├── Definition Service
   ├── Process Service
   ├── Task Service
   ├── Job Service
   ├── Incident Service
   └── History Service
   │
   ▼
Workflow Engine
   │
   ├── Token Engine
   ├── Gateway Engine
   ├── Expression Engine
   ├── Job Executor
   └── Worker Registry
   │
   ▼
SQLite
```

Do not allow the browser to access SQLite directly.

---

# Main Application Artifacts

The primary artifacts of the application are:

1. Workflow Designer
2. Workflow Definition Format
3. Workflow Definition Validator
4. Workflow Definition Management
5. Process Instance List
6. Process Instance Viewer
7. Human Task Inbox
8. Dynamic Task Forms
9. Jobs Dashboard
10. Worker Management
11. Incident Dashboard
12. History Timeline
13. Variables Inspector
14. REST or RPC API
15. Workflow Runtime Engine
16. Database Schema and Migrations
17. Automated Tests
18. Logging and Diagnostics

Each artifact should have a clear responsibility.

---

# Workflow Designer

The Workflow Designer is the primary workflow-authoring interface.

It should contain:

```text
┌─────────────────────────────────────────────────────────────┐
│ Workflow Name                              Save   Deploy     │
├────────────┬───────────────────────────────┬─────────────────┤
│ Palette    │ Canvas                        │ Properties      │
│            │                               │                 │
│ Start      │        ┌─────────┐            │ Name            │
│ User Task  │        │ START   │            │                 │
│ Service    │        └────┬────┘            │ Type            │
│ Gateway    │             │                 │                 │
│ Timer      │             ▼                 │ Worker          │
│ End        │       ┌─────────────┐         │                 │
│            │       │ Review      │         │ Conditions      │
│            │       └──────┬──────┘         │                 │
└────────────┴───────────────────────────────┴─────────────────┘
```

The designer should support:

- drag-and-drop nodes
- connecting nodes with edges
- editing node properties
- editing transition conditions
- assigning worker types
- defining user task metadata
- validation before deployment
- zoom and pan
- node positioning
- saving draft definitions
- deploying immutable workflow versions

Recommended initial node types:

```text
START
END
USER_TASK
SERVICE_TASK
EXCLUSIVE_GATEWAY
PARALLEL_GATEWAY
TIMER
MESSAGE
```

---

# Workflow Definition Artifact

The visual designer should serialize workflows to a declarative workflow definition.

JSON is recommended for the initial implementation.

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
      "key": "reviewOrder",
      "type": "USER_TASK",
      "name": "Review Order"
    },
    {
      "key": "approvalGateway",
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
      "to": "reviewOrder"
    },
    {
      "from": "reviewOrder",
      "to": "approvalGateway"
    },
    {
      "from": "approvalGateway",
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

Do not encode executable application functions into the workflow definition.

Store stable identifiers such as:

```text
payment.charge
email.send
agent.research
invoice.generate
```

Resolve those identifiers through a worker registry.

---

# Workflow Layout Artifact

Keep visual layout metadata logically separate from workflow execution semantics.

Example:

```json
{
  "nodes": {
    "start": {
      "x": 120,
      "y": 240
    },
    "reviewOrder": {
      "x": 360,
      "y": 240,
      "width": 180,
      "height": 80
    }
  }
}
```

This allows workflow definitions to remain execution-focused while the designer stores positions and visual metadata.

---

# Workflow Definition Validator

Validate workflows before deployment.

At minimum validate:

```text
process key exists
node keys are unique
START node exists
END node exists
edges reference valid nodes
service tasks contain worker types
gateway expressions are valid
required properties exist
invalid cycles are detected where appropriate
unreachable nodes are reported
```

The UI should display validation errors directly on the affected nodes or transitions when possible.

Do not allow obviously invalid workflow definitions to deploy.

---

# Workflow Management

Create a workflow management screen.

It should show:

```text
WORKFLOWS

Order Approval        v5     ACTIVE
Invoice Processing    v3     ACTIVE
Customer Onboarding   v8     SUSPENDED
```

Required capabilities:

- list workflows
- search workflows
- view versions
- open designer
- deploy new version
- activate definition
- suspend definition
- inspect definition metadata
- start test process
- view active instances

Workflow definitions should be immutable after deployment.

Editing a deployed workflow creates a new version.

Example:

```text
orderApproval v1
orderApproval v2
orderApproval v3
```

Existing process instances continue running against the version under which they started.

---

# Process Instance List

Provide an operations view of workflow executions.

Example:

```text
PROCESS INSTANCES

ID      Process           Business Key     Status
19281   Order Approval    ORD-18291        RUNNING
19280   Order Approval    ORD-18290        COMPLETED
19279   Refund Process    REF-8821         FAILED
19278   Order Approval    ORD-18289        SUSPENDED
```

Recommended filters:

```text
process definition
status
business key
start date
end date
definition version
incident status
```

Recommended states:

```text
RUNNING
COMPLETED
FAILED
CANCELLED
SUSPENDED
```

The list should link to a Process Instance Viewer.

---

# Process Instance Viewer

The Process Instance Viewer is one of the most important artifacts.

It should display the workflow diagram with runtime state overlaid on the definition.

Example:

```text
Order Approval #19281
Status: RUNNING

      ✓
   ┌───────┐
   │ START │
   └───┬───┘
       │
       ▼
   ✓ Review Order
       │
       ▼
   ✓ Approval Gateway
       │
       ▼
 ▶ Charge Card
       │
       ▼
     ○ END
```

Recommended visual states:

```text
completed
active
waiting
failed
cancelled
not reached
```

The viewer should combine data from:

```text
process_definition
process_node
process_edge
process_instance
token
task
job
incident
history_event
```

The user should be able to click a node and inspect:

- current state
- token
- task
- job
- incident
- input variables
- output variables
- timestamps
- execution history

---

# Runtime Overlay

Keep workflow definition rendering separate from runtime state.

Conceptually:

```text
Workflow Definition
        +
Runtime State
        =
Runtime Diagram
```

A runtime overlay structure may look like:

```json
{
  "processInstanceId": 19281,
  "nodes": {
    "start": {
      "state": "COMPLETED"
    },
    "reviewOrder": {
      "state": "COMPLETED"
    },
    "charge": {
      "state": "ACTIVE",
      "jobId": 7282
    },
    "end": {
      "state": "NOT_REACHED"
    }
  }
}
```

Do not modify the deployed workflow definition merely to show execution state.

---

# Human Task Inbox

Human workflow participants need a task application.

Example:

```text
MY TASKS

Task              Process          Created        Priority
Review Order      ORD-10482        10 min ago     HIGH
Approve Refund    REF-9281         31 min ago     NORMAL
Verify Account    ACC-28191        1 hour ago     NORMAL
```

The Task Inbox should support:

- filtering
- searching
- claiming tasks
- assigning tasks
- task priority
- due dates
- process context
- opening task forms
- completing tasks

Useful filters include:

```text
assigned to me
unassigned
candidate group
process
priority
due date
created date
```

---

# Task Detail

A task detail page should contain:

```text
Task name
Process instance
Business key
Assignee
Candidate groups
Priority
Created timestamp
Due timestamp
Relevant workflow variables
Task form
Task history
```

Completing a task must call the workflow engine through the API.

The UI must never manually advance workflow state.

---

# Dynamic Task Form Artifact

Avoid hard-coding every human task form.

Allow workflows to define form metadata.

Example:

```json
{
  "fields": [
    {
      "name": "approved",
      "type": "boolean",
      "label": "Approve order",
      "required": true
    },
    {
      "name": "comment",
      "type": "textarea",
      "label": "Comment"
    }
  ]
}
```

Recommended initial field types:

```text
text
textarea
number
boolean
select
date
datetime
json
```

Form submission should convert values into workflow or task variables.

Validate submitted data on both client and server.

Never rely only on client-side validation.

---

# Jobs Dashboard

Provide visibility into asynchronous service work.

Example:

```text
JOBS

READY       23
RUNNING      4
FAILED       2
DEAD         1
```

A jobs table should show:

```text
job id
worker type
process instance
node
status
retries
due time
lock owner
lock expiration
last error
created time
```

A job detail view should show:

```text
Job #7282

Worker:
payment.charge

Process:
Order Approval #19281

Status:
FAILED

Retries:
1 remaining

Last Error:
Payment provider timeout
```

Administrative actions may include:

```text
Retry Now
Cancel Job
Open Process Instance
Open Incident
```

Destructive or execution-changing operations should require appropriate authorization.

---

# Worker Management

Provide a worker status view when workers run as external processes or registered services.

Possible fields:

```text
worker id
worker type
status
last heartbeat
current jobs
completed jobs
failed jobs
last error
```

Example:

```text
WORKERS

payment-worker-1      payment.charge     ONLINE
email-worker-1        email.send         ONLINE
agent-worker-2        agent.research     OFFLINE
```

Do not require worker state to be part of the initial MVP unless it is operationally useful.

---

# Incident Dashboard

Incidents represent problems that require operator attention.

Example:

```text
INCIDENTS

Process        Node            Error               Age
ORD-18291      Charge Card     Worker timeout      12 min
INV-821        Send Email      Missing worker      31 min
```

Incident detail should include:

```text
incident type
process instance
workflow version
node
token
job
error message
error details
retry count
variables
history
created time
resolved time
```

Possible operations:

```text
Retry Job
Resolve Incident
Cancel Process
Open Process Diagram
```

The UI should never hide the underlying runtime state when an incident occurs.

---

# History Timeline

Provide an append-oriented execution timeline.

Example:

```text
10:41:12   PROCESS_STARTED

10:41:12   NODE_ENTERED
           Start

10:41:12   NODE_COMPLETED
           Start

10:41:12   TASK_CREATED
           Review Order

10:44:29   TASK_CLAIMED
           user: mike

10:46:04   TASK_COMPLETED

10:46:04   GATEWAY_SELECTED
           approved == true

10:46:04   JOB_CREATED
           payment.charge

10:46:05   JOB_STARTED

10:46:07   JOB_COMPLETED

10:46:07   PROCESS_COMPLETED
```

History should primarily come from `history_event`.

Do not reconstruct audit history only from current runtime tables.

---

# Variables Inspector

A process instance should expose its workflow variables.

Example:

```text
VARIABLES

customerId      38291
orderId         ORD-18291
amount          3420
approved        true
currency        USD
```

Support structured JSON inspection.

Example:

```json
{
  "shippingAddress": {
    "city": "New York",
    "country": "US"
  }
}
```

For admin users, variable editing may be useful, but it should be restricted.

Changing variables in a live workflow may alter gateway behavior or future execution.

Record administrative variable changes in history.

---

# Backend API

Expose a stable API between the browser and workflow services.

Recommended endpoint groups:

```text
/api/definitions
/api/processes
/api/tasks
/api/jobs
/api/incidents
/api/history
/api/messages
/api/workers
```

Example definition endpoints:

```text
GET    /api/definitions
POST   /api/definitions
GET    /api/definitions/:id
GET    /api/definitions/:id/versions
POST   /api/definitions/:id/deploy
```

Example runtime endpoints:

```text
GET    /api/processes
POST   /api/processes
GET    /api/processes/:id
POST   /api/processes/:id/cancel
POST   /api/processes/:id/suspend
POST   /api/processes/:id/resume
```

Example task endpoints:

```text
GET    /api/tasks
GET    /api/tasks/:id
POST   /api/tasks/:id/claim
POST   /api/tasks/:id/complete
```

Example job endpoints:

```text
GET    /api/jobs
GET    /api/jobs/:id
POST   /api/jobs/:id/retry
```

Example incident endpoints:

```text
GET    /api/incidents
GET    /api/incidents/:id
POST   /api/incidents/:id/resolve
```

Example process inspection endpoints:

```text
GET /api/processes/:id/variables
GET /api/processes/:id/history
GET /api/processes/:id/runtime
```

---

# API Design Rules

The API must:

- validate input
- authorize actions
- return stable error structures
- use workflow engine services rather than manipulate runtime tables directly
- support pagination
- support filtering
- support deterministic sorting
- expose IDs needed for navigation
- avoid leaking internal SQL details

Use consistent error responses.

Example:

```json
{
  "error": {
    "code": "TASK_ALREADY_COMPLETED",
    "message": "Task 782 has already been completed."
  }
}
```

---

# Real-Time Updates

Process monitoring benefits from real-time UI updates.

Possible mechanisms:

```text
WebSocket
Server-Sent Events
short polling
```

Use real-time updates for:

```text
process state changes
job state changes
incident creation
task creation
task completion
worker status
```

Do not make real-time transport the authoritative state.

The database remains authoritative.

If a WebSocket event is missed, refreshing the page must reconstruct correct state from the API.

---

# Frontend Structure

A clean frontend structure might be:

```text
web/
│
├── pages/
│   ├── WorkflowsPage
│   ├── WorkflowDesignerPage
│   ├── WorkflowVersionsPage
│   ├── InstancesPage
│   ├── InstancePage
│   ├── TasksPage
│   ├── TaskPage
│   ├── JobsPage
│   ├── JobPage
│   ├── IncidentsPage
│   ├── IncidentPage
│   └── WorkersPage
│
├── components/
│   ├── WorkflowCanvas
│   ├── NodePalette
│   ├── NodeProperties
│   ├── EdgeProperties
│   ├── ProcessDiagram
│   ├── RuntimeOverlay
│   ├── TaskForm
│   ├── HistoryTimeline
│   ├── VariableInspector
│   └── StatusBadge
│
├── api/
│
├── state/
│
├── hooks/
│
└── utils/
```

Framework choice may be React, Vue, Angular, or another suitable frontend framework.

Do not tightly couple workflow semantics to a particular UI framework.

---

# Backend Structure

A clean backend structure might be:

```text
server/
│
├── api/
│   ├── definitions.routes.ts
│   ├── processes.routes.ts
│   ├── tasks.routes.ts
│   ├── jobs.routes.ts
│   ├── incidents.routes.ts
│   └── workers.routes.ts
│
├── services/
│   ├── definition-service.ts
│   ├── process-service.ts
│   ├── task-service.ts
│   ├── job-service.ts
│   ├── incident-service.ts
│   └── history-service.ts
│
├── engine/
│   ├── workflow-engine.ts
│   ├── token-engine.ts
│   ├── gateway-engine.ts
│   └── expression-engine.ts
│
├── workers/
│   ├── worker-registry.ts
│   └── worker-runner.ts
│
├── repositories/
│   ├── definition.repository.ts
│   ├── process.repository.ts
│   ├── token.repository.ts
│   ├── task.repository.ts
│   ├── job.repository.ts
│   ├── incident.repository.ts
│   └── history.repository.ts
│
├── database/
│   ├── sqlite.ts
│   └── migrations/
│
└── tests/
```

Keep these responsibilities separate:

```text
routes
    handle HTTP

services
    coordinate application actions

engine
    implements workflow behavior

repositories
    persist data

workers
    perform external asynchronous work
```

---

# Database Artifacts

The minimum runtime schema should contain:

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

Optional later tables may include:

```text
deployment
message_subscription
timer_subscription
task_assignment
job_attempt
worker
form_definition
schema_migration
```

All schema changes should use migrations.

Example:

```text
001_initial_schema.sql
002_add_job_locking.sql
003_add_message_subscriptions.sql
004_add_task_candidate_groups.sql
```

---

# Workflow Engine Artifact

The Workflow Engine is separate from the web UI.

Its job is to move tokens through nodes and create durable waiting states.

Conceptual flow:

```text
Process Instance
      │
      ▼
    Token
      │
      ▼
     Node
      │
      ├── continue immediately
      ├── create user task
      ├── create job
      ├── create timer
      ├── split tokens
      └── complete
```

The browser must not implement this logic.

---

# Job Worker Artifact

Workers perform asynchronous service work.

Architecture:

```text
Workflow Engine
      │
      ▼
     JOB
      │
      ▼
Worker Registry
      │
      ▼
Worker Handler
      │
      ▼
External Service
```

Example worker registration:

```javascript
engine.registerWorker("payment.charge", async context => {
    // perform external work
});
```

Service task definitions reference worker identifiers rather than executable functions.

---

# Authentication and Authorization

Separate human user permissions from workflow execution.

Possible roles:

```text
workflow-designer
workflow-operator
task-user
administrator
viewer
```

Example permissions:

```text
workflow-designer
    create and deploy definitions

workflow-operator
    inspect instances
    retry jobs
    resolve incidents

task-user
    claim and complete assigned tasks

viewer
    read-only access
```

Authorization must be enforced server-side.

Do not rely on hidden buttons as security.

---

# Search and Filtering

Operational workflow systems quickly accumulate large numbers of records.

Build reusable filtering for:

```text
workflows
process instances
tasks
jobs
incidents
history events
```

Support:

```text
pagination
sorting
status filters
date ranges
business key
workflow key
assignee
worker type
incident type
```

Database indexes should support common filters.

---

# Logging and Diagnostics

Use structured logging.

Include identifiers where relevant:

```text
processDefinitionId
processInstanceId
tokenId
nodeId
taskId
jobId
incidentId
workerId
requestId
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

Provide correlation between application logs and workflow runtime records.

---

# UI Navigation

A practical primary navigation structure is:

```text
Workflows
Instances
Tasks
Jobs
Incidents
Workers
Settings
```

If the application separates end users from operators, Task Inbox may be a separate experience.

Example:

```text
Operator App
    Workflows
    Instances
    Jobs
    Incidents
    Workers

Task App
    My Tasks
    Group Tasks
    Completed Tasks
```

---

# Dashboard

A useful operations dashboard may summarize:

```text
Running Processes
Waiting Tasks
Ready Jobs
Failed Jobs
Open Incidents
Completed Today
```

Do not make a dashboard a dependency for the initial workflow engine.

It is a presentation artifact, not a runtime requirement.

---

# MVP Artifacts

For the first usable web application, prioritize these eight artifacts:

1. Workflow Designer
2. Workflow JSON Definition
3. Workflow Definition Management
4. Process Instance Viewer
5. Task Inbox
6. Jobs and Incident Dashboard
7. History Timeline
8. REST API and Workflow Engine

The MVP should support:

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

Avoid implementing every BPMN feature before basic runtime execution is reliable.

---

# Suggested Implementation Order

Build the application in this order:

1. SQLite schema and migrations
2. Workflow engine
3. Repository layer
4. Definition API
5. Process runtime API
6. Workflow definition JSON
7. Workflow designer
8. Process instance list
9. Process instance viewer
10. Human task API
11. Task inbox and forms
12. Job worker system
13. Jobs dashboard
14. Retry handling
15. Incident handling
16. Incident dashboard
17. History timeline
18. Variables inspector
19. Real-time updates
20. Authentication and authorization
21. Advanced workflow features

Do not build the graphical designer before establishing a stable workflow definition format and backend execution model.

---

# Testing Artifacts

Create automated tests covering frontend, backend, database, and workflow behavior.

Backend integration tests should cover:

```text
deploy workflow
start process
complete task
execute job
retry failed job
create incident
complete process
cancel process
suspend process
```

Workflow tests should cover:

```text
straight-through workflow
user task workflow
exclusive gateway
parallel split
parallel join
service retry
incident
timer
```

UI tests should cover:

```text
create workflow
connect nodes
edit node properties
validate workflow
deploy workflow
start process
open task
complete task
inspect process state
retry failed job
resolve incident
```

Crash recovery tests are mandatory for durable workflow behavior.

---

# Design Rules

The agent must follow these rules.

Do not let the browser advance tokens directly.

Do not let the browser access SQLite directly.

Do not duplicate workflow execution logic in frontend code.

Do not mutate deployed workflow definitions.

Do not treat in-memory frontend state as authoritative runtime state.

Do not perform long external operations inside SQLite write transactions.

Do not use arbitrary `eval()` for workflow expressions.

Do not assume jobs execute exactly once.

Do not assume workflows have only one active token.

Do not delete workflow history merely because an execution failed.

Do not hide runtime failures from operators.

Do not make visual layout coordinates part of workflow execution semantics unless absolutely necessary.

---

# Product Philosophy

The web application should make the durable workflow engine understandable and controllable.

The system should always allow a user or operator to answer:

```text
What workflows exist?

Which version is deployed?

Which processes are running?

Where is this process currently waiting?

Which tasks require human action?

Which jobs are ready or failing?

Why did this process fail?

What variables does the process contain?

Which path did the workflow take?

What happened before the current state?

Can the workflow safely resume?
```

The web application is successful when the underlying workflow runtime is visible, inspectable, and operable without hiding the durable state machine beneath unnecessary abstractions.
