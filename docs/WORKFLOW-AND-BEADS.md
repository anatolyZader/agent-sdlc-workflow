# Workflow Module and Beads Integration

This document explains how the **workflow** business module operates and what role the **beads** (bd) package plays in the pipeline.

---

## 1. How the Workflow Module Works

The workflow module orchestrates the AI-assisted SDLC pipeline: it persists runs, advances through a fixed sequence of steps, runs each step via a step executor, stores artifacts, and enforces optional gates and retries.

### 1.1 Main concepts

| Concept | Description |
|--------|-------------|
| **Workflow run** | A single pipeline execution for one feature. Stored in the workflow repo (SQLite or in-memory) with `id`, `featureTitle`, `status`, `currentStep`, `completedSteps`, `artifacts`, `planJson`, etc. |
| **Step plan** | The ordered list of steps for a run. Default plan is built by `stepPlanFactory.js` and stored as `planJson` on the run. |
| **Step** | One unit of work (e.g. eventstorm, c4, spec, plan, beads, tdd_red, tdd_green, lint, secure, doc). Each step has a `name`, `mode` (`auto` or `manualCheckpoint`), and optional `exitCriteria`. |
| **Step executor** | Implements `IWorkflowStepExecutorPort`. Resolves the controller for the current step, builds a request body from the run’s artifacts and context, calls `controller.run(request)`, and normalizes the result into a standard envelope. |
| **Artifacts** | Outputs from steps (e.g. paths to spec.md, plan.md, .beads). Merged into `run.artifacts` by type (e.g. `artifacts.spec`, `artifacts.plan`, `artifacts.beads`) and passed to later steps. |

### 1.2 Run lifecycle

1. **Start** — `WorkflowService.startWorkflow({ featureTitle, options })`  
   Creates a new run with `status: 'running'`, `currentStep: 'eventstorm'`, and `planJson` from `buildDefaultStepPlan()`. Saves the run and returns `runId` and `status`.

2. **Resume** — `WorkflowService.resumeWorkflow(runId)`  
   - Loads the run. If status is not `running`, returns current state without executing.  
   - If the current step has `mode: 'manualCheckpoint'` (e.g. tdd_red), updates status to `waiting_for_red_commit` and returns; no step is run.  
   - Otherwise calls `stepExecutor.runStep({ stepName: run.currentStep, inputs: { run, plan } })`.  
   - If the step returns `status: 'ok'` and the step has `exitCriteria`, runs gates (e.g. `requiredKeys` for eventstorm). If a gate fails, the step result is treated as failed.  
   - Merges step artifacts into `run.artifacts` (by `artifact.type`).  
   - **On failure:** Increments retries; if under `maxStepRetries`, keeps `currentStep` and returns; else sets run `status: 'failed'`.  
   - **On success:** Appends `currentStep` to `completedSteps`, sets `currentStep` to the next step in the plan (or `null` if none), sets `status` to `'running'` or `'completed'`, resets retries, and updates the run.

3. **Get run** — `WorkflowService.getRun(runId)`  
   Returns run state: `runId`, `status`, `currentStep`, `completedSteps`, `artifacts`, `lastError`, `planJson`.

4. **Abort** — `WorkflowService.abortWorkflow(runId)`  
   Sets run `status: 'aborted'`.

### 1.3 Step plan (default order)

Defined in `business_modules/workflow/app/stepPlanFactory.js`:

```
eventstorm → c4 → spec → plan → beads → tdd_red (manual) → tdd_green → lint → secure → doc
```

- **eventstorm** has `exitCriteria` (e.g. `requiredKeys`) so the run does not advance until the eventstorm result satisfies the gate.  
- **tdd_red** is a manual checkpoint: after it runs, the workflow pauses until the client signals (e.g. commit); resume then continues with tdd_green.

### 1.4 Step executor and controllers

`InProcessStepExecutorAdapter` implements the step executor:

- It holds a **controller per step** (eventstorm, c4, spec, plan, beads, tdd_red, tdd_green, lint, secure, doc).
- For a given `stepName`, it builds a request **body** via `_bodyForStep(stepName, run)` (e.g. for `spec`: eventstorm + c4 artifacts, featureTitle; for `beads`: planArtifacts, featureTitle).
- It calls `controllers[stepName].run({ body })`, then normalizes the return value into the standard envelope: `{ status, artifacts, metrics, errors, logs }`.
- Controllers are provided by other business modules (spec, plan, c4, tdd, lint, secure, doc) or by the workflow module itself (beads).

So the workflow module **orchestrates** steps; the actual work for each step is done by the corresponding controller (and behind it, services/adapters in their modules). The only step implemented **inside** the workflow module is **beads**, via `workflowBeadsAdapter` and `beadsController`.

### 1.5 Persistence and configuration

- **Workflow repo** — Persists runs (and optionally artifacts). Implemented by `WorkflowSqliteAdapter` when `config.databasePath` is set, otherwise by an in-memory adapter.
- **Config** — Injected into the workflow service and step executor (e.g. `projectRoot`, `stepTimeoutMs`, `maxStepRetries`). `projectRoot` is used by steps that need the repo root (e.g. beads, spec, plan).

---

## 2. Role of the Beads Package

**Beads** ([steveyegge/beads](https://github.com/steveyegge/beads)) is a distributed, git-backed graph issue tracker for AI agents. The CLI is **bd** (e.g. `bd init`, `bd ready`, `bd create "Title"`). Its role in this pipeline is to keep development aware of the state of changes across the full SDLC and TDD (see §2.1).

### 2.1 Intended role of beads

The role of the **bd** package in this pipeline is to **keep development aware of the state of changes during the full SDLC and TDD** — not only at a single beads step. Beads is meant to be the place where progress and state are tracked across the whole pipeline: eventstorm, c4, spec, plan, tdd_red, tdd_green, lint, secure, doc. That includes:

- Reflecting which phases are done, in progress, or blocked.
- Holding a dependency-aware task graph (from plan and implementation work) so agents and tools see what has changed and what is ready next.
- Staying in sync with the workflow so that beads remains the shared view of where we are and what changed throughout the SDLC and TDD.

So beads is **state awareness across the pipeline**, not just init once and expose an artifact.

### 2.2 Relation to the state machine concept

The pipeline can be seen as a **state machine**:

- **States:** The workflow run has a discrete state: `status` (e.g. `running`, `completed`, `failed`, `aborted`, `waiting_for_red_commit`) and a position in the step plan given by `currentStep` and `completedSteps`. Each step (eventstorm, c4, spec, plan, beads, tdd_red, tdd_green, …) is a state or a state in a linear/modal flow.
- **Transitions:** Start (→ `running`, `currentStep: eventstorm`); resume (→ run current step, then on success advance `currentStep` and append to `completedSteps`, or on failure retry or → `failed`); manual checkpoint (→ `waiting_for_red_commit`); abort (→ `aborted`). Transitions are triggered by commands and step outcomes.
- **Persistence:** The current state is stored on the run (e.g. in the workflow repo) so it can be resumed.

**Beads** in its intended role is the **external representation** of that state (and possibly finer-grained task state): the place where the state machine’s current state—which phase is done, in progress, or blocked—is mirrored or projected so that development (humans and agents) stays aware. So the workflow *is* the state machine; beads is where that state (and task-level “ready” / dependency state) is made visible and kept in sync. A fuller beads integration would update beads on each transition (e.g. after each step completion) so the beads graph always reflects the current state of the pipeline.

### 2.3 Current implementation

- The workflow does **not** implement a separate beads business module. Beads functionality is implemented **inside the workflow module** via **`workflowBeadsAdapter.js`**.
- **Beads step** (after plan, before tdd_red): ensures the project has beads inited (`bd init --quiet` if needed), runs `bd ready --json`, and exposes a beads artifact.
- **Run-state sync (fuller integration):** The workflow calls **`syncRunState(run)`** on the beads port after **every** run update: on start, after each step completion (eventstorm, c4, spec, plan, beads, tdd_red, tdd_green, lint, secure, doc), on failure, on manual checkpoint, and on abort. The adapter ensures `.beads` exists, then writes **`.beads/sdlc-run-state.json`** with the current run state (`runId`, `featureTitle`, `status`, `currentStep`, `completedSteps`, `stepNames`, `updatedAt`). Agents and tools can read this file to see where the pipeline is. Sync is non-fatal: if it fails (e.g. no bd CLI), the workflow continues. Optional future work: create/update bd tasks from the plan and mark them done as steps complete (e.g. `bd create`, `bd update`, `bd dep add`).

### 2.4 Beads-related pieces

| Piece | Location | Role |
|-------|----------|------|
| **beadsCli.js** | Project **root** | CLI wrapper: `runBd`, `runBdInit`, `runBdReady`, `isBeadsInited`, `writeSdlcRunState(projectRoot, state)` for `.beads/sdlc-run-state.json`. Uses `bd` on PATH or `BEADS_CLI_PATH`. |
| **IWorkflowBeadsPort** | `workflow/domain/ports/IWorkflowBeadsPort.js` | Port: `run(inputs)` → step envelope; `syncRunState(run)` → sync run state into beads (state file / future: bd tasks). |
| **WorkflowBeadsAdapter** | `workflow/infrastructure/adapters/workflowBeadsAdapter.js` | Implements beads step and run-state sync: init + ready + artifact in `run()`; in `syncRunState()` writes `.beads/sdlc-run-state.json` with run state. |
| **BeadsController** | `workflow/app/beadsController.js` | Controller for the beads step: maps request body to port inputs and calls `workflowBeadsPort.run(...)`. |

### 2.5 Beads step flow (current)

1. Orchestrator calls `stepExecutor.runStep({ stepName: 'beads', inputs: { run, plan } })`.
2. Step executor builds body `{ planArtifacts, featureTitle, workflowRunId }` and calls `beadsController.run({ body })`.
3. `BeadsController` delegates to `WorkflowBeadsAdapter.run(inputs)`.
4. Adapter uses **beadsCli.js** (root):
   - If `.beads` does not exist, runs `bd init --quiet` in `projectRoot`.
   - Runs `bd ready --json` to list ready tasks.
   - Returns `{ status: 'ok', artifacts: [{ type: 'beads', path: '.beads', meta: { inited: true, readyOk } }], metrics, errors: [] }`.
5. Workflow merges `artifacts.beads` into the run and advances to the next step (tdd_red).

If `bd` is not installed or `bd init` fails, the adapter returns `status: 'failed'` and the workflow applies retry/ failure logic as for any other step.

### 2.6 Why beads lives in the workflow module

- Beads is used as a **pipeline step** (ensure project has beads, surface ready tasks) and as **run-state sync** after every workflow transition (see §2.3). Beads is not implemented as a separate domain with its own API surface.
- The workflow already owns “run step X”; implementing the beads step inside the workflow (via `workflowBeadsAdapter` and `beadsController`) keeps all step orchestration in one place and avoids a separate beads module.
- The **bd** CLI is invoked from a single root-level helper (`beadsCli.js`) so that both the adapter and any future callers use the same CLI interface and env (e.g. `BEADS_CLI_PATH`).

### 2.7 Installing and configuring beads

- Install the **bd** CLI (e.g. `npm install -g @beads/bd` or see [beads](https://github.com/steveyegge/beads)).
- Optional: set `BEADS_CLI_PATH` to the full path of the `bd` executable if it is not on PATH.
- The beads step will run `bd init --quiet` in the workflow `projectRoot` when `.beads` is missing; no separate “beads module” setup is required.

---

## 3. Summary

- **Workflow module:** Owns run lifecycle (start, resume, get, abort), step plan, step execution via controllers, artifact merging, gates, and retries. It does not implement most steps itself; it delegates to other modules' controllers. The only step it implements is **beads**. After every run update it calls **syncRunState(run)** so beads stays in sync.
- **Intended role of beads:** Keep development aware of the **state of changes during the full SDLC and TDD** — i.e. beads should reflect progress and changes across all steps (eventstorm through doc).
- **Current implementation:** (1) A beads step (after plan) ensures the project is beads-inited and exposes a beads artifact. (2) **Run-state sync:** after every workflow transition (start, step completion, failure, manual checkpoint, abort), the workflow calls the beads port's `syncRunState(run)`; the adapter writes **`.beads/sdlc-run-state.json`** with current run state so agents and tools can read pipeline state. Optional future: create/update bd tasks from the plan as steps complete.
