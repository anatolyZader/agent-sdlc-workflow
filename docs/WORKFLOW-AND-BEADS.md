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
- **Beads step** (after plan, before tdd_red): ensures the project has beads inited (`bd init --quiet` if needed), runs `bd ready --json`; if **bd ready** fails the step fails and the workflow does not advance (strict). On success, the step writes **`.beads/ready.json`** only when `bd ready --json` stdout is valid JSON (defensive parse); returns artifact **repo-relative path `'.beads'`** and meta `inited` plus `readyPath: '.beads/ready.json'` only when that file was written.
- **Run-state sync (fuller integration):** The workflow calls **`syncRunState(run)`** on the beads port after **every** run update: on start, after each step completion (eventstorm, c4, spec, plan, beads, tdd_red, tdd_green, lint, secure, doc), on failure, on manual checkpoint, and on abort. The adapter writes **`.beads/sdlc-run-state.json`** (creating `.beads` if missing; **no bd required**), so the pipeline mirror exists even when bd is not installed. The file contains the current run state (`runId`, `featureTitle`, `status`, `currentStep`, `completedSteps`, `stepNames`, `updatedAt`). Agents and tools can read it to see where the pipeline is. Sync is non-fatal: if it fails, the workflow continues. Optional future work: create/update bd tasks from the plan and mark them done as steps complete (e.g. `bd create`, `bd update`, `bd dep add`).

### 2.4 Beads-related pieces

| Piece | Location | Role |
|-------|----------|------|
| **beadsCli.js** | Project **root** | CLI wrapper: `runBd` (respects passed `env.BEADS_CLI_PATH`, spawns with `shell: false`), `runBdInit`, `runBdReady`, `isBeadsInited`, `writeSdlcRunState`, `writeReadyJson` for `.beads/ready.json`. Executable: env then process.env then `bd` for BEADS_CLI_PATH. |
| **IWorkflowBeadsPort** | `workflow/domain/ports/IWorkflowBeadsPort.js` | Port: `run(inputs)` → step envelope; `syncRunState(run)` → sync run state into beads (state file / future: bd tasks). |
| **WorkflowBeadsAdapter** | `workflow/infrastructure/adapters/workflowBeadsAdapter.js` | Beads step: init; then `bd ready --json` — **if it fails the step fails** (strict). On success writes stdout to `.beads/ready.json` **only when valid JSON**; returns artifact **path `'.beads'`** (repo-relative), meta `inited` and optionally `readyPath`. `syncRunState()` creates `.beads` if needed (no bd) and writes `.beads/sdlc-run-state.json`. |
| **BeadsController** | `workflow/app/beadsController.js` | Controller for the beads step: maps request body to port inputs and calls `workflowBeadsPort.run(...)`. |

### 2.5 Beads step flow (current)

1. Orchestrator calls `stepExecutor.runStep({ stepName: 'beads', inputs: { run, plan } })`.
2. Step executor builds body `{ planArtifacts, featureTitle, workflowRunId }` and calls `beadsController.run({ body })`.
3. `BeadsController` delegates to `WorkflowBeadsAdapter.run(inputs)`.
4. Adapter uses **beadsCli.js** (root):
   - If `.beads` does not exist, runs `bd init --quiet` in `projectRoot`. If init fails, returns `status: 'failed'` and the workflow does not advance.
   - Runs `bd ready --json` to list ready tasks. **If `bd ready` fails**, returns `status: 'failed'` (strict: step fails so the workflow can retry or stop).
   - On success: if stdout is valid JSON, writes to **`.beads/ready.json`**; then returns `status: 'ok'`, artifacts: `[{ type: 'beads', path: '.beads', meta: { inited: true, readyPath: '.beads/ready.json' } }]` (path **repo-relative**; `readyPath` only when file was written).
5. Workflow merges `artifacts.beads` into the run (value is `'.beads'`) and advances to the next step (tdd_red).

If the bd CLI is missing or `bd init` or `bd ready` fails, the adapter returns `status: 'failed'` and the workflow applies retry/failure logic as for any other step.

### 2.6 Why beads lives in the workflow module

- Beads is used as a **pipeline step** (ensure project has beads, surface ready tasks) and as **run-state sync** after every workflow transition (see §2.3). Beads is not implemented as a separate domain with its own API surface.
- The workflow already owns “run step X”; implementing the beads step inside the workflow (via `workflowBeadsAdapter` and `beadsController`) keeps all step orchestration in one place and avoids a separate beads module.
- The **bd** CLI is invoked from a single root-level helper (`beadsCli.js`) so that both the adapter and any future callers use the same CLI interface and env. Passed `env.BEADS_CLI_PATH` is respected by `runBd()`; spawn uses `shell: false` for security.

### 2.7 Installing and configuring beads

- Install the **bd** CLI (e.g. `npm install -g @beads/bd` or see [beads](https://github.com/steveyegge/beads)).
- Optional: set `BEADS_CLI_PATH` to the full path of the `bd` executable if it is not on PATH.
- **Short prefix:** Use a short issue prefix (e.g. `bd-` or project-specific) so IDs stay readable and under token limits when agents read `issues.jsonl`; configure via bd if needed.
- The beads step will run `bd init --quiet` in the workflow `projectRoot` when `.beads` is missing; no separate “beads module” setup is required.

### 2.8 Beads maintenance (author best practices)

Run these regularly so this project follows the [Beads author's best practices](https://github.com/steveyegge/beads):

- **Daily (or in CI):** `bd doctor` — diagnoses and can auto-fix issues, migrations, git hooks. Use `bd doctor --fix` to apply fixes.
- **Every few days:** `bd cleanup --days N` — deletes issues older than N days (e.g. `--days 2`) to keep the database small (~200–500 issues). Issues stay in git history. Optionally run `bd sync` after to push to git.
- **Weekly or biweekly:** `bd upgrade` — upgrade the bd CLI; then run `bd doctor [--fix]`.

These are not automated by the workflow; run them manually or from a local/CI script. See §4 for the full verification table.

### 2.9 How beads is our package — at the plan stage and throughout the SDLC (detailed)

This section explains in detail how **beads (bd)** is integrated as “our” package: both at the **plan stage** (the dedicated beads step that runs right after the plan step) and **throughout the whole SDLC** (run-state sync after every workflow transition). Beads is not a separate business module; it is owned and driven by the **workflow** module so that the pipeline and Beads stay aligned.

---

#### 2.9.1 What “beads is our package” means

- **Beads** is the [steveyegge/beads](https://github.com/steveyegge/beads) project: a distributed, git-backed graph issue tracker for AI agents, with a CLI **bd** (`bd init`, `bd ready`, `bd create`, etc.).
- **“Our package”** here means: we treat Beads as the **project’s** task/state surface. The workflow module is responsible for (1) ensuring the project has Beads inited and usable, (2) exposing the Beads artifact (`.beads`) to the pipeline and to agents, and (3) **keeping Beads in sync with the workflow** so that at any moment “what Beads shows” reflects “where we are” in the SDLC and TDD.
- We do **not** ship a separate “beads” business module. All Beads-related behaviour lives **inside the workflow module**: the **workflow beads port** (`IWorkflowBeadsPort`), the **workflow beads adapter** (`WorkflowBeadsAdapter`), and the **beads controller** (`BeadsController`). The workflow calls the **bd** CLI via a single root-level helper, **`beadsCli.js`**, so every use of Beads (step and sync) goes through one interface and one `projectRoot`.

So: beads is “our package” in the sense that **our workflow owns** when and how Beads is initialised, when we run `bd ready`, and when we write pipeline state into the Beads tree (`.beads/sdlc-run-state.json`). Agents and tools then **read** from Beads (and optionally create/update bd issues) using the same **bd** CLI and the same `.beads` directory.

---

#### 2.9.2 At the plan stage: when and how the beads step runs

The **plan stage** in this pipeline is the **plan** step: eventstorm → c4 → spec → **plan** → **beads** → tdd_red → … . The **beads** step is the first time we run Beads as a **named pipeline step**. It runs **once per run**, immediately after **plan** and before **tdd_red**.

**When it runs**

- Only when the workflow **resume** executes the step whose `name` is `'beads'`. That happens when `run.currentStep === 'beads'`, i.e. after the **plan** step has completed successfully and the run has been updated (plan artifact merged, `currentStep` set to `'beads'`).
- So the beads step runs **after** we have a plan artifact (e.g. `plan.md` or a path in `run.artifacts.plan`). It does **not** run after eventstorm, c4, or spec alone; it runs only in the fixed order of the step plan, when the current step is **beads**.

**What the step executor passes in**

- The step executor (`InProcessStepExecutorAdapter`) builds a **body** for the beads step in `_bodyForStep('beads', run)`:
  - **`planArtifacts`** — `run.artifacts.plan` (path or artifact for the plan produced by the plan step).
  - **`featureTitle`** — `run.featureTitle`.
  - **`workflowRunId`** — `run.id`.
- So at the plan stage, the beads controller and adapter **receive** the plan output and the feature context. They do **not** receive the full run state (e.g. `completedSteps`) in the body; that is available on `run` in the orchestrator but is not passed as part of the beads **step** request body.

**What the beads step does (code path)**

1. **BeadsController.run({ body })** is invoked by the step executor. The controller forwards to **WorkflowBeadsAdapter.run(inputs)** (the same adapter that later implements `syncRunState`).
2. **WorkflowBeadsAdapter.run()** (using **beadsCli.js** at project root):
   - Calls **`isBeadsInited(projectRoot)`** (checks for `.beads` directory).
   - If not inited: runs **`runBdInit(projectRoot, { quiet: true })`** (i.e. `bd init --quiet`). On failure, returns `status: 'failed'` and the workflow does not advance.
   - Runs **`runBdReady(projectRoot, { json: true })`** (i.e. `bd ready --json`). **If `bd ready` fails**, returns `status: 'failed'` so the workflow does not advance (strict).
   - On success: if stdout is valid JSON, writes to **`.beads/ready.json`**; then returns **step envelope**: `status: 'ok'`, `artifacts: [{ type: 'beads', path: '.beads', meta: { inited: true, readyPath: '.beads/ready.json' } }]` (path **repo-relative**; `readyPath` only when file written), plus `metrics` and `errors: []`.
3. The workflow **merges** the beads artifact into `run.artifacts` (`artifacts.beads` = `'.beads'`), then advances: `completedSteps` gets `'beads'` appended, `currentStep` becomes `'tdd_red'`, and the run is persisted.

**What the beads step does *not* do (current implementation)**

- It does **not** create bd issues or epics from the plan (no `bd create` from plan content). Optional future work: “import” the plan into Beads as epics/issues with dependencies.
- It does **not** read or parse `planArtifacts` to populate Beads; it only ensures the project has Beads and exposes the artifact. The **run-state sync** (see below) is what writes pipeline state into `.beads/sdlc-run-state.json`.

So at the **plan stage**, beads is “our package” in this sense: **we guarantee** that by the time we move to tdd_red, the repo has a working `.beads` and we have run `bd ready` once, and the run’s artifacts include the beads artifact for downstream steps and for agents.

---

#### 2.9.3 Throughout the SDLC: run-state sync at every transition

Beyond the single beads **step**, beads stays “ours” because we **sync the workflow run state into the Beads tree after every run update**. That way, Beads (and anyone reading from `.beads`) always sees the current pipeline state.

**Where sync is triggered**

- **WorkflowService** holds an optional **`workflowBeadsPort`**. After **every** persistent update to a run, the service calls **`_syncRunStateToBeads(run)`**, which calls **`workflowBeadsPort.syncRunState(run)`** if the port exists (and swallows errors so sync never fails the workflow).
- Sync is invoked after:
  1. **startWorkflow** — right after `workflowRepo.save(run)` (run has `currentStep: 'eventstorm'`, `completedSteps: []`).
  2. **resumeWorkflow** — after **every** `workflowRepo.update(updated)`:
     - When the current step is a **manual checkpoint** (e.g. tdd_red): after updating status to `waiting_for_red_commit`.
     - When the current step **fails**: after updating retry count (if retrying) or after setting `status: 'failed'`.
     - When the current step **succeeds**: after merging artifacts, appending the completed step to `completedSteps`, setting `currentStep` to the next step (or `null`), and updating the run.
  3. **abortWorkflow** — after `workflowRepo.update(updated)` with `status: 'aborted'`.

So **every** state change that we persist (start, step success, step failure, manual checkpoint, abort) is reflected in Beads shortly after.

**What gets written**

- **WorkflowBeadsAdapter.syncRunState(run)**:
  - If `run` is null or has no `id`, it returns without doing anything.
  - Otherwise it calls **writeSdlcRunState(projectRoot, state)** which creates `.beads` if missing (fs.mkdir) and writes the state file. **No bd or bd init required** — the pipeline mirror always exists when sync runs.
  - It builds a **state** object from the run:
    - **runId** = `run.id`
    - **featureTitle** = `run.featureTitle`
    - **status** = `run.status` (e.g. `running`, `completed`, `failed`, `aborted`, `waiting_for_red_commit`)
    - **currentStep** = `run.currentStep` (e.g. `'spec'`, `'beads'`, `'tdd_green'`, or `null` when done)
    - **completedSteps** = `run.completedSteps` (array of step names completed so far)
    - **stepNames** = list of step names from `run.planJson` (the full plan order)
    - **updatedAt** = `run.updatedAt` (ISO string)
  - It then calls **beadsCli.writeSdlcRunState(projectRoot, state)**, which writes **`.beads/sdlc-run-state.json`** (creating `.beads` if needed) with the above JSON. Any previous content is overwritten.

So “throughout the SDLC” means: after **eventstorm**, **c4**, **spec**, **plan**, **beads**, **tdd_red**, **tdd_green**, **lint**, **secure**, and **doc** (and on failure or abort), the file `.beads/sdlc-run-state.json` is updated to match the current run. Beads is thus **our** package in the sense that **we own** this file and keep it aligned with the workflow state machine.

---

#### 2.9.4 End-to-end timeline (one run)

1. **startWorkflow**  
   Run created with `currentStep: 'eventstorm'`, `completedSteps: []`.  
   → **syncRunState(run)** → `.beads/sdlc-run-state.json` shows status `running`, currentStep `eventstorm`, completedSteps `[]`.

2. **resume** (eventstorm runs)  
   Step completes, artifacts merged, `completedSteps: ['eventstorm']`, `currentStep: 'c4'`.  
   → **syncRunState(updated)** → state file shows eventstorm done, current step c4.

3. **resume** (c4, then spec, then plan)  
   Same pattern: after each step, run is updated then **syncRunState(updated)** runs. So after **plan**, the state file shows eventstorm, c4, spec, plan done and `currentStep: 'beads'`.

4. **resume** (beads **step** runs)  
   Beads step: init (if needed), `bd ready --json`, beads artifact merged. Run updated to `completedSteps: [..., 'beads']`, `currentStep: 'tdd_red'`.  
   → **syncRunState(updated)** → state file shows beads step done, current step tdd_red.

5. **resume** (tdd_red is manual checkpoint)  
   No step execution; run updated to `status: 'waiting_for_red_commit'`.  
   → **syncRunState(updated)** → state file shows waiting_for_red_commit.

6. **resume** (tdd_green, lint, secure, doc)  
   Each step completion triggers run update then **syncRunState(updated)**. When the last step (doc) completes, `currentStep` becomes `null`, `status: 'completed'`.  
   → state file shows full pipeline completed.

7. **If a step fails** (e.g. spec fails)  
   Run updated with `status: 'failed'` (or retry count).  
   → **syncRunState(updated)** → state file shows failed and which step failed.

8. **abortWorkflow**  
   Run updated to `status: 'aborted'`.  
   → **syncRunState(updated)** → state file shows aborted.

So from **plan stage** onward we have both: (a) the **beads step** that ran once after plan (init + ready + artifact), and (b) **run-state sync** after every transition, so Beads always reflects where we are in the SDLC and TDD.

---

#### 2.9.5 What agents and tools see

- **`.beads/`** — The Beads directory (created by `bd init` or by our adapter when writing state/ready files). It contains at least:
  - **`sdlc-run-state.json`** — Written by us on every sync. Agents and tools can read this to see: which run, which feature, run status, current step, list of completed steps, full step plan, and last update time.
  - **`ready.json`** — Written by the beads step when `bd ready --json` succeeds and stdout is valid JSON; contains the ready-task list. Meta includes `readyPath: '.beads/ready.json'` only when this file was written.
  - Other Beads-managed files (e.g. `issues.jsonl`, config) if the user or agents use `bd create`, `bd ready`, etc.
- **`bd ready`** — Run by the beads **step** (and can be run anytime by agents). Returns tasks with no open blockers; combined with `sdlc-run-state.json`, agents know both “what the pipeline has done” and “what bd tasks are ready.”
- **Single source of truth for pipeline position** — For “where are we in the SDLC?”, the canonical answer is in the workflow repo (run record). The **mirror** of that for Beads and for file-based tooling is `.beads/sdlc-run-state.json`. So beads is “our package” in the sense that we **own** keeping that mirror up to date at every transition, from plan stage through to the last step (doc) or failure/abort.

---

## 3. Summary

- **Workflow module:** Owns run lifecycle (start, resume, get, abort), step plan, step execution via controllers, artifact merging, gates, and retries. It does not implement most steps itself; it delegates to other modules' controllers. The only step it implements is **beads**. After every run update it calls **syncRunState(run)** so beads stays in sync.
- **Intended role of beads:** Keep development aware of the **state of changes during the full SDLC and TDD** — i.e. beads should reflect progress and changes across all steps (eventstorm through doc).
- **Current implementation:** (1) A beads step (after plan) ensures the project is beads-inited and exposes a beads artifact. (2) **Run-state sync:** after every workflow transition (start, step completion, failure, manual checkpoint, abort), the workflow calls the beads port's `syncRunState(run)`; the adapter writes **`.beads/sdlc-run-state.json`** with current run state so agents and tools can read pipeline state. Optional future: create/update bd tasks from the plan as steps complete. For a full walkthrough of how beads is our package at the plan stage and throughout the SDLC, see **§2.9**.

---

## 4. Beads author best practices — verification

The following checklist is based on [best practices from the Beads author](https://github.com/steveyegge/beads) (solo development). Use it to keep this project aligned.

| Practice | We follow? | Notes |
|----------|------------|--------|
| **Run bd doctor regularly** | Partial | §2.8 now documents running `bd doctor` daily and `bd doctor --fix`. Not yet automated in this repo; run manually or from a script. |
| **Keep your database small** | Partial | §2.8 now documents `bd cleanup --days N` and optional `bd sync`. Not automated; run manually or from a script. |
| **Upgrade regularly and do daily hygiene** | Partial | §2.8 now documents `bd upgrade` and `bd doctor [--fix]` weekly or biweekly. Run manually. |
| **Plan outside Beads, then import** | Partial | We **plan outside** beads: eventstorm → c4 → spec → **plan** → beads. We do **not** yet import the plan into Beads as epics/issues (optional future work). So we follow "plan outside"; "then import" is not implemented. |
| **Restart agents frequently** | No | Author: one task at a time, kill process and start new agent; Beads is working memory between sessions. We have no AGENTS.md or agent instructions. **Recommendation:** If you use AI agents, add instructions to use `bd ready` and restart between tasks; keep Beads as the source of truth between runs. |
| **Ask the AI to file lots of issues** | No | Author: file beads for work &gt; ~2 minutes; for code reviews, tell the agent to file beads as it goes. No such instructions in this repo. **Recommendation:** Add to AGENTS.md or similar: "Use bd for any work &gt; ~2 min; file beads during code reviews." |
| **Use a short issue prefix** | Partial | §2.7 documents using a short prefix; we do not set a default in code. Choose one (e.g. `bd-`, `mlp-`) and configure via bd. |
| **File Beads bug reports and feature requests** | N/A | Community practice: use [Beads GitHub Issues](https://github.com/steveyegge/beads/issues) and Discussions. No code change; link in docs is sufficient. |

**Summary:** We align with **plan outside Beads** (spec + plan before beads step). **bd doctor**, **bd cleanup**, and **bd upgrade** are now documented in §2.8 (run manually or script). We do **not** yet automate them, set a short prefix, or add AGENTS.md instructions for agent restart and filing beads; add those as needed for your workflow.
