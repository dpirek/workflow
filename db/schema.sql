PRAGMA foreign_keys = ON;

-- ==========================================================
-- PROCESS DEFINITIONS
-- ==========================================================

CREATE TABLE process_definition (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,

    process_key     TEXT NOT NULL,
    name            TEXT NOT NULL,
    version         INTEGER NOT NULL DEFAULT 1,

    description     TEXT,

    status          TEXT NOT NULL DEFAULT 'ACTIVE'
                    CHECK(status IN (
                        'ACTIVE',
                        'SUSPENDED',
                        'RETIRED'
                    )),

    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(process_key, version)
);


-- ==========================================================
-- WORKFLOW NODES
--
-- Examples:
-- START
-- END
-- USER_TASK
-- SERVICE_TASK
-- SCRIPT_TASK
-- EXCLUSIVE_GATEWAY
-- PARALLEL_GATEWAY
-- TIMER
-- MESSAGE
-- ==========================================================

CREATE TABLE process_node (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,

    process_definition_id INTEGER NOT NULL,

    node_key            TEXT NOT NULL,
    name                TEXT,

    node_type           TEXT NOT NULL
                        CHECK(node_type IN (
                            'START',
                            'END',
                            'USER_TASK',
                            'SERVICE_TASK',
                            'SCRIPT_TASK',
                            'EXCLUSIVE_GATEWAY',
                            'PARALLEL_GATEWAY',
                            'TIMER',
                            'MESSAGE'
                        )),

    config_json         TEXT,

    FOREIGN KEY(process_definition_id)
        REFERENCES process_definition(id)
        ON DELETE CASCADE,

    UNIQUE(process_definition_id, node_key)
);


-- ==========================================================
-- WORKFLOW CONNECTIONS
-- ==========================================================

CREATE TABLE process_edge (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,

    process_definition_id INTEGER NOT NULL,

    edge_key            TEXT,

    source_node_id      INTEGER NOT NULL,
    target_node_id      INTEGER NOT NULL,

    -- For gateways:
    -- amount > 100
    -- approved == true
    condition_expression TEXT,

    priority            INTEGER DEFAULT 0,

    FOREIGN KEY(process_definition_id)
        REFERENCES process_definition(id)
        ON DELETE CASCADE,

    FOREIGN KEY(source_node_id)
        REFERENCES process_node(id)
        ON DELETE CASCADE,

    FOREIGN KEY(target_node_id)
        REFERENCES process_node(id)
        ON DELETE CASCADE
);


-- ==========================================================
-- PROCESS INSTANCES
-- ==========================================================

CREATE TABLE process_instance (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,

    process_definition_id INTEGER NOT NULL,

    business_key        TEXT,

    status              TEXT NOT NULL DEFAULT 'RUNNING'
                        CHECK(status IN (
                            'RUNNING',
                            'COMPLETED',
                            'FAILED',
                            'CANCELLED',
                            'SUSPENDED'
                        )),

    started_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at            DATETIME,

    parent_instance_id  INTEGER,

    FOREIGN KEY(process_definition_id)
        REFERENCES process_definition(id),

    FOREIGN KEY(parent_instance_id)
        REFERENCES process_instance(id)
);


-- ==========================================================
-- TOKENS / EXECUTIONS
--
-- Very important for workflow engines.
--
-- A token represents WHERE execution currently is.
--
-- Parallel gateway:
--     one token can become several tokens.
--
-- Join gateway:
--     several tokens can merge.
-- ==========================================================

CREATE TABLE token (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,

    process_instance_id INTEGER NOT NULL,
    node_id             INTEGER NOT NULL,

    parent_token_id     INTEGER,

    state               TEXT NOT NULL DEFAULT 'ACTIVE'
                        CHECK(state IN (
                            'ACTIVE',
                            'WAITING',
                            'COMPLETED',
                            'CANCELLED'
                        )),

    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at        DATETIME,

    FOREIGN KEY(process_instance_id)
        REFERENCES process_instance(id)
        ON DELETE CASCADE,

    FOREIGN KEY(node_id)
        REFERENCES process_node(id),

    FOREIGN KEY(parent_token_id)
        REFERENCES token(id)
);


-- ==========================================================
-- PROCESS VARIABLES
--
-- JSON is particularly convenient with SQLite JSON1.
-- ==========================================================

CREATE TABLE variable (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,

    process_instance_id INTEGER NOT NULL,

    name                TEXT NOT NULL,

    value_type          TEXT NOT NULL DEFAULT 'JSON'
                        CHECK(value_type IN (
                            'STRING',
                            'INTEGER',
                            'REAL',
                            'BOOLEAN',
                            'JSON',
                            'NULL'
                        )),

    value_json          TEXT,

    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(process_instance_id)
        REFERENCES process_instance(id)
        ON DELETE CASCADE,

    UNIQUE(process_instance_id, name)
);


-- ==========================================================
-- HUMAN TASKS
-- ==========================================================

CREATE TABLE task (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,

    process_instance_id INTEGER NOT NULL,
    token_id            INTEGER,
    node_id             INTEGER NOT NULL,

    task_key            TEXT,
    name                TEXT NOT NULL,

    status              TEXT NOT NULL DEFAULT 'CREATED'
                        CHECK(status IN (
                            'CREATED',
                            'CLAIMED',
                            'COMPLETED',
                            'CANCELLED'
                        )),

    assignee            TEXT,
    candidate_group     TEXT,

    priority            INTEGER DEFAULT 50,

    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    claimed_at          DATETIME,
    completed_at        DATETIME,
    due_at              DATETIME,

    FOREIGN KEY(process_instance_id)
        REFERENCES process_instance(id)
        ON DELETE CASCADE,

    FOREIGN KEY(token_id)
        REFERENCES token(id),

    FOREIGN KEY(node_id)
        REFERENCES process_node(id)
);


-- ==========================================================
-- TASK VARIABLES
-- ==========================================================

CREATE TABLE task_variable (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,

    task_id         INTEGER NOT NULL,

    name            TEXT NOT NULL,
    value_json      TEXT,

    FOREIGN KEY(task_id)
        REFERENCES task(id)
        ON DELETE CASCADE,

    UNIQUE(task_id, name)
);


-- ==========================================================
-- ASYNC JOBS
--
-- Used for:
--
-- service tasks
-- timers
-- retries
-- message processing
-- background work
-- ==========================================================

CREATE TABLE job (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,

    process_instance_id INTEGER NOT NULL,
    token_id            INTEGER,
    node_id             INTEGER NOT NULL,

    job_type            TEXT NOT NULL
                        CHECK(job_type IN (
                            'SERVICE_TASK',
                            'TIMER',
                            'MESSAGE',
                            'ASYNC_CONTINUATION'
                        )),

    status              TEXT NOT NULL DEFAULT 'READY'
                        CHECK(status IN (
                            'READY',
                            'RUNNING',
                            'COMPLETED',
                            'FAILED',
                            'DEAD'
                        )),

    payload_json        TEXT,

    retries             INTEGER NOT NULL DEFAULT 3,

    due_at              DATETIME,

    locked_by           TEXT,
    locked_until        DATETIME,

    last_error          TEXT,

    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at        DATETIME,

    FOREIGN KEY(process_instance_id)
        REFERENCES process_instance(id)
        ON DELETE CASCADE,

    FOREIGN KEY(token_id)
        REFERENCES token(id),

    FOREIGN KEY(node_id)
        REFERENCES process_node(id)
);


-- ==========================================================
-- INCIDENTS / ERRORS
-- ==========================================================

CREATE TABLE incident (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,

    process_instance_id INTEGER NOT NULL,
    job_id              INTEGER,
    node_id             INTEGER,

    incident_type       TEXT NOT NULL,

    message             TEXT,
    details             TEXT,

    status              TEXT NOT NULL DEFAULT 'OPEN'
                        CHECK(status IN (
                            'OPEN',
                            'RESOLVED'
                        )),

    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at         DATETIME,

    FOREIGN KEY(process_instance_id)
        REFERENCES process_instance(id)
        ON DELETE CASCADE,

    FOREIGN KEY(job_id)
        REFERENCES job(id),

    FOREIGN KEY(node_id)
        REFERENCES process_node(id)
);


-- ==========================================================
-- HISTORY / AUDIT LOG
-- ==========================================================

CREATE TABLE history_event (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,

    process_instance_id INTEGER NOT NULL,

    node_id             INTEGER,
    token_id            INTEGER,
    task_id             INTEGER,
    job_id              INTEGER,

    event_type          TEXT NOT NULL,

    event_data_json     TEXT,

    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(process_instance_id)
        REFERENCES process_instance(id)
        ON DELETE CASCADE
);


-- ==========================================================
-- INDEXES
-- ==========================================================

CREATE INDEX idx_process_instance_definition
ON process_instance(process_definition_id);

CREATE INDEX idx_process_instance_status
ON process_instance(status);

CREATE INDEX idx_token_instance
ON token(process_instance_id);

CREATE INDEX idx_token_state
ON token(state);

CREATE INDEX idx_token_node
ON token(node_id);

CREATE INDEX idx_task_instance
ON task(process_instance_id);

CREATE INDEX idx_task_assignee
ON task(assignee);

CREATE INDEX idx_task_status
ON task(status);

CREATE INDEX idx_job_status_due
ON job(status, due_at);

CREATE INDEX idx_job_locked
ON job(locked_until);

CREATE INDEX idx_variable_instance
ON variable(process_instance_id);

CREATE INDEX idx_history_instance
ON history_event(process_instance_id);

CREATE INDEX idx_history_created
ON history_event(created_at);