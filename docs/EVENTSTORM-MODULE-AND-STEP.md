# EventStorm Module and Step — Extended Documentation

This document describes how the EventStorm step is performed in the agent-sdlc-workflow and how the eventstorm business module is structured, wired, and integrated with the workflow.

---

## Table of contents

1. [Overview](#1-overview)
2. [How the EventStorm step is performed](#2-how-the-eventstorm-step-is-performed)
3. [EventStorm module architecture](#3-eventstorm-module-architecture)
4. [Relevant files reference](#4-relevant-files-reference)
5. [Data contracts and schemas](#5-data-contracts-and-schemas)
6. [Configuration and dependencies](#6-configuration-and-dependencies)
7. [Troubleshooting](#7-troubleshooting)
8. [Improvements and hardening](#8-improvements-and-hardening)
9. [How the agents work together (EventStorm session)](#9-how-the-agents-work-together-eventstorm-session)

---

## 1. Overview

The **eventstorm** step is the first step in the default workflow. It runs an EventStorming session via the Claude CLI (eventstorm-coordinator agent), writes artifacts under `docs/eventstorm/<sessionId>/`, and produces a **summary** that downstream steps (c4, spec, tdd) consume.

- **Step name:** `eventstorm`
- **Mode:** `auto` (no manual checkpoint)
- **Entry point from workflow:** `stepExecutor.runStep({ stepName: 'eventstorm', workflowRunId, inputs: { run, plan } })`
- **Artifact contract:** On success, the workflow stores `run.artifacts.eventstorm = 'docs/eventstorm/<sessionId>/summary.json'`

The eventstorm **module** follows the project’s hexagonal layout: input (optional HTTP), app (controller + service), domain (ports), infrastructure (adapter). The only implementation of the facilitation port is the **ClaudeCodeEventstormAdapter**, which spawns the Claude CLI and reads/validates `summary.json`.

---

## 2. How the EventStorm step is performed

### 2.1 Step plan and run state

- The default step plan is built in **`business_modules/workflow/app/stepPlanFactory.js`**. The first step is always **eventstorm** with:
  - **name:** `eventstorm`
  - **mode:** `auto`
  - **exitCriteria:** a gate that requires the step result to contain: `domainEvents`, `commands`, `aggregates`, `boundedContexts`, `openQuestions`, `mermaid`

- When a run is started, `workflowService.startWorkflow` creates a run with:
  - `currentStep: 'eventstorm'`
  - `planJson` set to this plan (or a provided plan).

### 2.2 Resume flow: workflow → step executor

On **POST /api/workflow/resume** (or equivalent in-process call):

1. **workflowService.resumeWorkflow(runId)** (`business_modules/workflow/app/workflowService.js`):
   - Loads the run; if `status !== 'running'`, returns current state without executing.
   - Finds the current step in `planJson` (e.g. `eventstorm`).
   - If the step is **manualCheckpoint**, updates run to `waiting_for_red_commit` and returns; otherwise continues.
   - Calls **stepExecutor.runStep({ stepName: run.currentStep, workflowRunId: run.id, inputs: { run, plan } })**.

2. **InProcessStepExecutorAdapter.runStep** (`business_modules/workflow/infrastructure/adapters/inProcessStepExecutorAdapter.js`):
   - Resolves the controller for the step: `this.controllers['eventstorm']` → **eventstormController**.
   - Builds the request body with **\_bodyForStep('eventstorm', run)**:
     - `domainName`: `run.featureTitle` or `'feature'`
     - `problemStatement`: `run.inputJson?.problemStatement` or `run.featureTitle` or `''`
     - `workflowRunId`: `run.id`
   - Creates an **AbortSignal** via `AbortSignal.timeout(stepTimeoutMs)` (default 5 minutes) and passes it as **request.signal** so the adapter can kill the Claude process on timeout.
   - Calls **eventstormController.run({ body, signal })**. On timeout the signal aborts, the adapter kills the child (SIGTERM then SIGKILL), and the promise rejects with `errorType: 'timeout'`.
   - The controller returns an **EventstormResult** (plain object with `sessionId`, `domainEvents`, etc.), not a `{ status, artifacts }` envelope.
   - **\_toEnvelope('eventstorm', result, durationMs)**:
     - If `stepName === 'eventstorm'` and `result` is truthy but **result.sessionId** is missing or empty, returns **status: 'failed'** with error "Eventstorm result missing sessionId" (no retry on soft failure).
     - Otherwise, if `result.sessionId` is present, sets **artifacts = [{ type: 'eventstorm', path: \`docs/eventstorm/${result.sessionId}/summary.json\` }]** and returns **{ status: 'ok', artifacts, metrics, errors, logs, rawResult }** to the workflow.

3. **workflowService** (continued):
   - If the step has **exitCriteria** (eventstorm does), runs **runGate** (e.g. `requiredKeys` on `rawResult`).
   - Merges **result.artifacts** into **run.artifacts** in **normalized form**: `run.artifacts[a.type] = { type, path: a.path ?? null, meta: a.meta ?? {} }`. Downstream steps receive the path via **getArtifactPath(artifacts, type)** (e.g. in the step executor’s _bodyForStep), which returns `artifacts[type].path` or the legacy value for backward compatibility.
   - **Retry policy:** On `result.status === 'failed'`, the service retries only when **result.errorType** is not `schema_invalid` and not `cli_exit`. So schema validation failures and CLI non-zero exits **do not retry** (fail fast); timeouts and transient errors still consume retries up to `maxStepRetries`.
   - On success: appends `eventstorm` to `completedSteps`, sets `currentStep` to the next step (e.g. `c4`), saves the run and returns.

So the **eventstorm step** is performed by: workflow → step executor (builds body from `run`, calls eventstorm controller, wraps result into workflow envelope with artifact path) → eventstorm controller → eventstorm service → Claude Code eventstorm adapter (prompt, spawn CLI, read/validate summary.json, return EventstormResult).

### 2.3 Inside the eventstorm module: controller → service → adapter

4. **EventstormController.run** (`business_modules/eventstorm/app/eventstormController.js`):
   - Validates body: must have **either** `rawText` **or** both `domainName` and `problemStatement`.
   - Calls **eventstormService.runSession({ rawText, sessionId, domainName, problemStatement, constraints, timeboxMinutes, contextSnippets })** and returns that promise’s result (no extra envelope).

5. **EventstormService.runSession** (`business_modules/eventstorm/app/eventstormService.js`):
   - Delegates to **this.facilitationPort.runSession(request)**. No branching; the implementation is entirely in the adapter.

6. **ClaudeCodeEventstormAdapter.runSession** (`business_modules/eventstorm/infrastructure/adapters/claudeCodeEventstormAdapter.js`):
   - **Session id:** uses `request.sessionId` or generates a new UUID.
   - **Input text:** builds a single string with **\_composeRawText(request)** (from `rawText` or from `domainName` + `problemStatement` + optional constraints, timebox, contextSnippets). Throws if empty.
   - **Artifact directory:** `docs/eventstorm/<sessionId>/` under `projectRoot`. The adapter **creates this directory** with `fs.mkdir(artifactPath, { recursive: true })` before spawning Claude, and optionally writes **input.txt** (composed raw text) there for traceability.
   - **Prompt:** Instructs the agent to run an EventStorm session with the given session id and composed input, and to write artifacts into that directory (e.g. `01-context.md` … `08-qa.md` and **summary.json**).
   - **Run Claude:** Uses injected **runClaudeAgent(prompt)** if provided (tests), otherwise **\_runClaudeAgent(prompt, request.signal)**. Stdout/stderr chunks are appended with **chunk.toString('utf8')** for safe Buffer handling.
     - **\_runClaudeAgent** spawns the **Claude CLI**: `claude --agent eventstorm-coordinator -p "<prompt>"` with `cwd: projectRoot`. If **request.signal** is provided (workflow step), the adapter listens for `signal.abort` (timeout): it kills the child (SIGTERM, then SIGKILL after 5s) and rejects with an error with **errorType: 'timeout'**.
   - If **!result.ok** (non-zero exit or spawn error), the adapter throws with **errorType: 'cli_exit'**; the error message includes a stderr snippet, and the error object carries `exitCode`, `stdout`, `stderr`.
   - If **ok**:
     - Reads **\<artifactDir\>/summary.json** (via injected `readFile` or `fs.readFile`). On read/parse failure throws with **errorType: 'io_missing'**.
     - Validates it with **summarySchema.json** (Ajv). On validation failure throws with **errorType: 'schema_invalid'**.
     - Reads **06-diagrams.mmd** for `mermaid.eventStorm` and **07-context-map.mmd** for `mermaid.contextMap` (both optional).
     - Maps summary fields into **EventstormResult** (e.g. `glossary` → `ubiquitousLanguage`, `events` → `domainEvents`, plus commands, policies, aggregates, boundedContexts, openQuestions, mermaid).
     - Returns that **EventstormResult** (with `sessionId`). The step executor then uses it in **\_toEnvelope** to set the artifact path.

The only component that talks to the outside world (Claude CLI and filesystem) is the **adapter**; the app and domain layers stay pure.

---

## 3. EventStorm module architecture

### 3.1 Layers

| Layer | Location | Role |
|-------|----------|------|
| **Input** | `input/eventstormRouter.js` | Registers POST /api/eventstorm/run; handler is `fastify.eventstormRun` (resolved in server.js to eventstormController.run). |
| **App – Controller** | `app/eventstormController.js` | Validates request body and calls eventstormService.runSession. |
| **App – Service** | `app/eventstormService.js` | Delegates runSession to eventstormFacilitationPort.runSession. |
| **Domain – Port** | `domain/ports/IEventstormFacilitationPort.js` | Interface: runSession(request) → Promise\<EventstormResult\>. |
| **Infrastructure** | `infrastructure/adapters/claudeCodeEventstormAdapter.js` | Implements facilitation port: prompt, spawn Claude CLI, read/validate summary.json, return EventstormResult. |

### 3.2 Ports (domain)

- **IEventstormFacilitationPort**: The only port used at runtime. Implemented by ClaudeCodeEventstormAdapter.
- **IEventstormArtifactStorePort**, **IEventstormLLMPort**: Reserved for future use; not implemented. See JSDoc in those files.

### 3.3 Wiring (composition root and server)

In **src/app/compositionRoot.js**:

- **eventstormFacilitationPort** → singleton **ClaudeCodeEventstormAdapter** (receives config, claudeCommand, optional runClaudeAgent / readFile).
- **eventstormService** → singleton **EventstormService(eventstormFacilitationPort)**.
- **eventstormController** → singleton **EventstormController(eventstormService)** (Awilix injects the service).
- **runSession** is also registered as a bound method for proxy/resolution needs.

The **step executor** receives **eventstormController** and calls **controller.run({ body })**; it does not reference the service or adapter directly. HTTP requests to **POST /api/eventstorm/run** go through **server.js** decorator **eventstormRun** → resolve eventstormController → **c.run(request)**.

---

## 4. Relevant files reference

### 4.1 Eventstorm module (`business_modules/eventstorm/`)

| File | Role |
|------|------|
| `input/eventstormRouter.js` | Registers POST /api/eventstorm/run; handler = fastify.eventstormRun. |
| `app/eventstormController.js` | Validates body (rawText or domainName+problemStatement), calls eventstormService.runSession. |
| `app/eventstormService.js` | Delegates runSession to eventstormFacilitationPort.runSession. |
| `domain/ports/IEventstormFacilitationPort.js` | Port: runSession(request) → Promise\<EventstormResult\>. |
| `domain/ports/IEventstormArtifactStorePort.js` | Reserved; not implemented. |
| `domain/ports/IEventstormLLMPort.js` | Reserved; not implemented. |
| `infrastructure/adapters/claudeCodeEventstormAdapter.js` | Implements facilitation: prompt, spawn Claude CLI, read/validate summary.json, return EventstormResult. |
| `infrastructure/summarySchema.json` | JSON Schema for validating summary.json produced by the agent. |

### 4.2 Workflow and composition (eventstorm step and wiring)

| File | Role |
|------|------|
| `business_modules/workflow/app/stepPlanFactory.js` | Default plan; first step is eventstorm (auto, with exitCriteria). |
| `business_modules/workflow/app/workflowService.js` | startWorkflow sets currentStep to eventstorm; resumeWorkflow calls stepExecutor.runStep and merges result.artifacts into run.artifacts. |
| `business_modules/workflow/infrastructure/adapters/inProcessStepExecutorAdapter.js` | Maps stepName eventstorm to eventstormController; _bodyForStep('eventstorm', run); _toEnvelope sets artifact path from result.sessionId. |
| `business_modules/workflow/domain/ports/IWorkflowStepExecutorPort.js` | Port for runStep({ stepName, workflowRunId, inputs }). |
| `src/app/compositionRoot.js` | Registers eventstormFacilitationPort, eventstormService, eventstormController (and runSession). |
| `src/app/server.js` | Decorates eventstormRun → resolve eventstormController, c.run(request); registers eventstormRouter. |

### 4.3 Downstream consumers of eventstorm artifacts

| File | Role |
|------|------|
| `business_modules/spec/infrastructure/adapters/specSpecKitAdapter.js` | resolveArtifact(eventstormArtifacts) uses eventstorm path or object. |
| `business_modules/spec/infrastructure/specKitHelper.js` | generateSpecMd(eventstorm, c4) uses eventstorm domainEvents, commands, aggregates, etc. |
| C4 / TDD step adapters | Receive eventstorm artifact path from run.artifacts when building step body. |

---

## 5. Data contracts and schemas

### 5.0 Gate as source of truth (step success)

The workflow **exit criteria gate** for the eventstorm step is the contract for “step success.” The gate runs on `result.rawResult` (EventstormResult) and uses `requiredKeys`: **domainEvents**, **commands**, **aggregates**, **boundedContexts**, **openQuestions**, **mermaid**. The adapter must return an object that includes these keys (and **sessionId** for the artifact path). The **summarySchema.json** validates the agent’s summary.json; its required fields are aligned with what the adapter needs to produce this EventstormResult (glossary, events, commands, policies, aggregates, boundedContexts, openQuestions). Additional summary fields (goal, scope, actors, capabilities, contradictions) are optional so the agent is not blocked if it omits them.

### 5.1 EventstormResult (domain)

Return type of **IEventstormFacilitationPort.runSession** and of the eventstorm controller when invoked by the step executor:

- **sessionId** (string)
- **ubiquitousLanguage** (array)
- **domainEvents** (array)
- **commands** (array)
- **policies** (array)
- **aggregates** (array)
- **boundedContexts** (array)
- **openQuestions** (array)
- **mermaid** (object: `eventStorm`, optional `contextMap`)

Defined in **IEventstormFacilitationPort.js** (JSDoc).

### 5.2 summary.json (infrastructure)

Produced by the Claude eventstorm-coordinator agent under `docs/eventstorm/<sessionId>/summary.json`. Validated by **infrastructure/summarySchema.json**. The adapter maps its fields (e.g. glossary → ubiquitousLanguage, events → domainEvents) into EventstormResult.

### 5.3 Workflow artifact contract

After a successful eventstorm step, the step executor sets:

- **artifacts**: `[{ type: 'eventstorm', path: 'docs/eventstorm/<sessionId>/summary.json' }]`

The workflow service stores artifacts in normalized form: **run.artifacts[type] = { type, path, meta }**. Downstream steps resolve the eventstorm artifact by path (e.g. via a helper that returns `artifacts.eventstorm.path` or the legacy value).

---

## 6. Configuration and dependencies

- **Claude CLI**: Must be installed and on PATH (e.g. `claude`). The adapter uses **claudeCommand** (default `'claude'`) and runs with **--agent eventstorm-coordinator**.
- **projectRoot**: Adapter and step executor use the app’s project root for `cwd` and for resolving `docs/eventstorm/<sessionId>/`.
- **Optional DI**: **runClaudeAgent**, **readFile**, and **writeFile** can be injected (e.g. in tests) to avoid spawning the real process or reading/writing real files.

### 6.1 Limitations: prompt via argv

The adapter passes the full session prompt to the Claude CLI as a single argument: **`-p "<prompt>"`**. This can hit **OS argv length limits** on some platforms and may expose the prompt in the **process list**. Keep session input (rawText / domainName+problemStatement+contextSnippets) to a reasonable size. If the Claude CLI gains support for stdin or file-based prompt (e.g. `-p @file`), the adapter can be updated to use it; until then, this limitation is documented here.

---

## 7. Troubleshooting

- **Eventstorm step fails with “non-zero exit”**: The Claude CLI process exited with a non-zero code (e.g. auth, TTY/headless, or agent behavior). Check the thrown error’s **stderr** (and **stdout**) properties; the message includes a short stderr snippet.
- **Missing run.artifacts.eventstorm**: Ensure the adapter returns an object with **sessionId**; the step executor only sets the artifact path when `stepName === 'eventstorm'` and `result.sessionId` is present.
- **Exit criteria gate failure**: The step result (EventstormResult) must contain the keys required by the plan’s exitCriteria (e.g. domainEvents, commands, aggregates, boundedContexts, openQuestions, mermaid). Validate summary.json against summarySchema and adapter mapping.
- **HTTP vs in-process**: POST /api/eventstorm/run goes through the same controller as the workflow step; the workflow calls the controller with a body built from **run** (featureTitle, inputJson.problemStatement, workflowRunId).

---

## 8. Improvements and hardening

The following improvements were added to make the eventstorm step and workflow more robust and observable.

### 8.1 Strict result shape (soft failure)

- **Executor _toEnvelope:** If `stepName === 'eventstorm'` and the controller returns a result without a non-empty **sessionId**, the executor returns **status: 'failed'** with error "Eventstorm result missing sessionId" instead of treating it as success. This prevents the exit gate from passing on a partial or malformed response while no artifact path is stored.

### 8.2 Artifact directory and input snapshot

- **Adapter:** The adapter creates the artifact directory with `fs.mkdir(artifactPath, { recursive: true })` **before** spawning the Claude CLI, so the agent can assume the directory exists. An **input.txt** file (composed raw text) is written under the artifact dir using **writeFile** (injectable; default `fs.writeFile`) for traceability and debugging.

### 8.3 Mermaid context map

- **Adapter:** The **contextMap** field in **EventstormResult.mermaid** is no longer always empty. The adapter reads **07-context-map.mmd** from the artifact dir when present (same pattern as **06-diagrams.mmd** for the eventStorm diagram). If the eventstorm-coordinator agent does not produce this file, contextMap remains an empty string.

### 8.4 Stdout/stderr chunk handling

- **Adapter _runClaudeAgent:** Node `data` events may deliver Buffers. The adapter appends with **chunk.toString('utf8')** for both stdout and stderr to avoid type ambiguity and ensure consistent string handling.

### 8.5 Timeout and process kill

- **Executor:** The step run uses **AbortSignal.timeout(stepTimeoutMs)** when available (Node 18+); otherwise a fallback **AbortController** plus **setTimeout** is used, and the timer is cleared in a **finally** block when the step settles so it does not outlive the run. The signal is passed in **request.signal** to the eventstorm controller and thence to the adapter.
- **Adapter:** When **request.signal** is provided, the adapter subscribes to `signal.abort` and removes the listener on settle (abort, close, or error). On abort (timeout), it kills the spawned Claude process with SIGTERM, then SIGKILL after a short grace period, and rejects with **errorType: 'timeout'**. This avoids leaving long-running Claude processes when the workflow times out or retries.

### 8.6 Normalized artifact storage and getArtifactPath

- **WorkflowService:** Artifacts are stored in a **normalized shape**: `run.artifacts[type] = { type, path: a.path ?? null, meta: a.meta ?? {} }`. This avoids the previous ambiguity where `run.artifacts.eventstorm` could be either a string path or an object.
- **Step executor:** A helper **\_getArtifactPath(artifacts, type)** returns `artifacts[type].path` when the stored value is the normalized object, or the legacy value (string or object) otherwise. **\_bodyForStep** uses this for eventstorm, c4, spec, plan, beads, tdd_red, and tdd_green so downstream steps receive a consistent path (or legacy value) for resolution.

### 8.7 Gate and schema alignment

- **summarySchema.json:** Required fields were reduced to those the adapter needs to build the EventstormResult and satisfy the workflow gate: **glossary**, **commands**, **events**, **policies**, **aggregates**, **boundedContexts**, **openQuestions**. Fields such as goal, scope, actors, capabilities, contradictions remain in the schema as optional so the agent is not blocked if it omits them.
- **Documentation:** Section 5.0 documents the **gate as source of truth** for step success (requiredKeys on EventstormResult).

### 8.8 Router schema (contextSnippets)

- **eventstormRouter:** The request body schema for **contextSnippets** was tightened to **items: { type: 'string' }** so that array elements are explicitly expected to be strings, matching how the adapter stringifies them in _composeRawText.

### 8.9 Retry policy and errorType

- **Adapter:** Thrown errors are tagged with **errorType**: `'cli_exit'` (non-zero CLI exit), `'io_missing'` (summary.json read/parse failure), `'schema_invalid'` (schema validation failure), and `'timeout'` (when the step executor’s AbortSignal fires).
- **Executor:** The catch path includes **errorType: err.errorType** in the returned failed result so the workflow can inspect it.
- **WorkflowService:** Retry behavior is configurable via **config.doNotRetryErrorTypes** (default `['schema_invalid']`). Only when **result.errorType** is in that list does the workflow **not retry** (it marks the run as failed immediately). By default, **cli_exit** is retried (transient CLI failures can succeed on retry); to never retry on CLI exit, set `doNotRetryErrorTypes: ['schema_invalid', 'cli_exit']`. Timeouts and other transient failures consume retries up to maxStepRetries.

---

## 9. How the agents work together (EventStorm session)

The eventstorm step does not call an LLM API directly. It invokes the **Claude CLI** with the **eventstorm-coordinator** agent. The coordinator runs an **interactive multi-loop EventStorm** session: a single **board.json** is the source of truth; subagents propose changes via **patch.json** (per-section add/remove/update); the coordinator applies patches, runs **scripts/validate-eventstorm-board.js**, and uses **metrics** to steer which loop to run next. At the end it writes **summary.json** from the final board so downstream steps (c4, spec, tdd) receive the same contract as before.

### 9.1 Agent definitions (location)

The coordinator and subagents are defined under **`.claude/agents/`** as Markdown files with YAML frontmatter (name, description, tools, model, permissionMode). The workflow adapter only invokes the coordinator by name; the coordinator uses the **Task()** tool to run each subagent. Artifacts live under **docs/eventstorm/\<sessionId\>/**; the adapter reads **board.json** when present (and valid) to build EventstormResult, otherwise falls back to **summary.json**.

### 9.2 Execution plan (multi-loop coordinator)

The coordinator (see `.claude/agents/eventstorm-coordinator.md`) runs:

1. **Bootstrap** — Task(eventstorm-context) and Task(eventstorm-glossary); merge into initial **board.json** (version 1).
2. **Loop A — Language** (max 3 iters): facilitator + glossary → patches; apply; validate (Bash). Exit when glossary stable.
3. **Loop B — Command/Event** (max 5 iters): eventstorm-events + skeptic → patches; apply; validate. Exit when orphan rate low.
4. **Loop C — Aggregate** (max 4 iters): eventstorm-aggregates + skeptic + scenario-runner → patches; apply; validate. Exit when ownership/ invariants clear.
5. **Loop D — Bounded context** (max 3 iters): eventstorm-bounded-contexts + skeptic → patches; apply; validate. Exit when no cycles.
6. **Decision logger** — Task(eventstorm-decision-logger) to finalize decisions[].
7. **Diagrams, specs, QA** — Task(eventstorm-diagrams) → 06/07 Mermaid; Task(eventstorm-specs) → 08-specs; Task(eventstorm-qa) → consistency.
8. **Write summary** — summary.json derived from final board (glossary, events, commands, policies, aggregates, boundedContexts, openQuestions). Optionally 01–08 .md for traceability.

**Steering:** After each loop the coordinator sets **board.metrics** (e.g. conflictsCount, orphanCommands, orphanEvents) and decides whether to re-run a loop or proceed. Validator: `node scripts/validate-eventstorm-board.js docs/eventstorm/<sessionId>/board.json`.

### 9.3 Role of each subagent

| Subagent | Role | Typical output |
|----------|------|----------------|
| **eventstorm-context** | Goal, scope (in/out), actors, constraints, assumptions, open questions. | Bootstrap → board (goal, scope, actors, etc.) |
| **eventstorm-glossary** | Ubiquitous language: term, definition, synonyms. | Bootstrap + Loop A → patch (glossary) |
| **eventstorm-facilitator** | Language alignment: open questions, decisions, assumptions, neededInfo. | Loop A → patch (openQuestions, decisions, assumptions, neededInfo) |
| **eventstorm-events** | Event modeler: commands (VerbNoun), events (past tense), policies. | Loop B → patch (commands, events, policies) |
| **eventstorm-skeptic** | Critical reviewer: contradictions, ownership, boundaries, cycles. | Loops B/C/D → patch (conflicts, openQuestions, decisions) |
| **eventstorm-aggregates** | Aggregate modeler: aggregates, invariants, ownsCommands, emitsEvents. | Loop C → patch (aggregates) |
| **eventstorm-scenario-runner** | Scenario walk-through; boundary violations, decisions. | Loop C → patch (decisions, conflicts) |
| **eventstorm-bounded-contexts** | Context mapper: BCs, responsibilities, integrations. | Loop D → patch (boundedContexts) |
| **eventstorm-decision-logger** | Finalize decisions from openQuestions/conflicts. | After Loop D → patch (decisions) |
| **eventstorm-diagrams** | Mermaid only: context map + key flows. | 06-diagrams.mmd, 07-context-map.mmd |
| **eventstorm-specs** | Spec index, summaries, I/O, edge cases. | 08-specs.md |
| **eventstorm-qa** | Consistency, contradictions, suggested fixes. | patch (conflicts, decisions) + Markdown report |

### 9.4 Data flow (session input → board → summary.json)

- The **adapter** builds a prompt (session id, artifact dir, session input, raw text) and spawns **claude --agent eventstorm-coordinator -p "..."**.
- The **coordinator** creates the session dir, initializes **board.json**, runs the loops (Task subagents, apply **patch.json**, Bash validate), sets **board.metrics**, then writes **summary.json** from the final board.
- **Subagents** read board.json (and session context), write **patch.json** in the session dir. The coordinator merges patches into the board and re-validates.
- The **adapter** (after CLI exit) prefers **board.json** when present and valid (boardSchema + boardValidator); otherwise reads **summary.json**. It maps to EventstormResult (glossary → ubiquitousLanguage, events → domainEvents, etc.) and reads 06/07 Mermaid for EventstormResult.mermaid.

### 9.5 Interactive mode (follow-up)

An **interactive** variant is planned but not yet implemented: the coordinator could pause with the top N **openQuestions** or **neededInfo**, store state (e.g. run status `waiting_for_eventstorm_input`), and resume when the user supplies answers (e.g. via API or UI). This would require workflow and adapter changes (e.g. a port for “wait for user input”, storing and restoring board/session state). Document as a follow-up when implementing.

The design keeps the workflow app agnostic of how the session is run: only the adapter knows about the CLI and artifact layout; the coordinator and subagents encapsulate the EventStorming discipline, board/patch flow, and output shape.

---

*Last updated to reflect the codebase including multi-loop EventStorm (board, patches, validator, role agents, steering) and agent-coordination documentation.*
