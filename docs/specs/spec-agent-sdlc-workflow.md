# Spec: AI-Assisted SDLC Workflow Engine

A GCP VM–based Fastify engine that orchestrates the AI-assisted SDLC pipeline: eventstorm → c4 → spec → plan → beads → tdd_red → tdd_green → lint → secure → doc, with optional budget (token/cost) policy, auth (JWT or X-Workflow-Token; JWT may be issued by an OAuth2 provider), SQLite persistence, and Awilix DI. The Cursor extension is a thin client that calls this API.

---

## Contract

- **Name:** SDLC Workflow Engine API
- **Signature / API:**
  - `POST /api/workflow/start` — start a new workflow run (body: `{ featureTitle: string, options?: { budgetProfile?: 'low'|'medium'|'high' } }`); returns `{ runId: string, status: string }`.
  - `POST /api/workflow/resume` — resume a paused run (body: `{ runId: string }`); returns `{ status: string, currentStep?: string, artifacts?: object }`.
  - `GET /api/workflow/:id` — get run state and artifacts; returns `{ runId, status, currentStep, completedSteps, artifacts, lastError? }`.
  - `POST /api/workflow/abort` — abort a run (body: `{ runId: string }`); returns `{ status: 'aborted' }`.
  - Step endpoints (called by orchestrator or directly by client):  
    `POST /api/eventstorm/run`, `POST /api/c4/run`, `POST /api/spec/run`, `POST /api/plan/run`, `POST /api/tdd/red`, `POST /api/tdd/green`, `POST /api/lint/run`, `POST /api/secure/run`, `POST /api/doc/run`, `POST /api/budget/plan`.
- **Location:** Fastify app bootstrap in `src/app/server.js`; route registration in `src/app/routes.js`; module routers under `business_modules/<moduleName>/input/<module>Router.js`.

---

## Business module

This spec describes the **workflow engine** as a whole. The following business modules are part of the system. The first version is scoped to **workflow** and **eventstorm**; c4, spec, tdd, lint, secure, doc, and budget are to be specified in separate specs or extended here later.

### Module: workflow

- **Purpose:** Orchestrate SDLC steps in order, enforce gates, persist state, support start/resume/abort.
- **Entities:** WorkflowRun (id, featureTitle, status, currentStep, completedSteps, createdAt, updatedAt, inputJson, planJson); WorkflowStep (name, mode, inputRefs, exitCriteria).
- **Value objects:** RunId (string UUID or slug), StepName (eventstorm | c4 | spec | plan | beads | tdd_red | tdd_green | lint | secure | doc), Gate (type: fileExists | jsonValid | qualityGateGreen | testsGreen | securityNoHigh | userConfirm; params).
- **Ports:** IStepExecutorPort — `runStep({ stepName, workflowRunId, inputs }) => Promise<{ status, artifacts, logs, metrics }>`; IWorkflowPersistencePort — `save(run)`, `get(runId)`, `update(run)`; IArtifactStorePort — `store(artifact) => ref`, `get(ref)`; IClockPort — `now() => Date` (for idempotency and timeboxing).
- **Location:** `business_modules/workflow/` (app: workflowService.js, stepPlanFactory.js, beadsController.js, gates/gateRunner.js; domain: ports/; infrastructure: adapters/inProcessStepExecutorAdapter.js, workflowBeadsAdapter.js, workflowSqliteAdapter.js, fsArtifactStoreAdapter.js or memoryArtifactStoreAdapter.js).

### Module: eventstorm

- **Purpose:** Run a DDD EventStorming session (via Claude Code agent team or mock) and return structured domain artifacts.
- **Entities:** None (stateless run).
- **Value objects:** EventstormRequest (domainName, problemStatement, constraints?, timeboxMinutes?, contextSnippets?); EventstormResult (ubiquitousLanguage[], domainEvents[], commands[], policies[], aggregates[], boundedContexts[], openQuestions[], mermaid: { eventStorm, contextMap }).
- **Ports:** IEventstormFacilitationPort — `runSession(request: EventstormRequest) => Promise<EventstormResult>`; IEventstormSessionRepo (optional) — save/get/appendProgress for async or audit.
- **Location:** `business_modules/eventstorm/` (app: eventstormService.js; domain: ports/; infrastructure: adapters/claudeCodeEventstormAdapter.js implementing IEventstormFacilitationPort).

### Other modules (referenced; detailed in separate specs)

- **c4:** Produce C4 L1/L2/L3 diagrams and dependency rules from eventstorm output.
- **spec:** Generate SpecMD from domain slice (eventstorm/c4); uses spec-kit CLI (check, optional init, template) when USE_SPEC_KIT_PACKAGE=1.
- **plan:** Generate implementation plan from spec via spec-kit CLI (specify plan); uses same spec-kit config (check, optional init).
- **beads:** Beads (bd) task tracking: ensure `bd init`, run `bd ready`; implemented in workflow module via workflowBeadsAdapter (root beadsCli.js).
- **tdd:** Red/green phases; ensure module scaffold; run tests-from-spec.
- **lint:** ESLint, Prettier, tests, SonarCloud gate.
- **secure:** npm audit, static analysis, secrets check.
- **doc:** Regenerate docs/architecture.md, module READMEs.
- **budget:** Token/cost policy; quality floors; step limits and escalation.

---

## Input / Output

### Workflow

| Input | Output |
|-------|--------|
| POST /api/workflow/start with `{ featureTitle: "refund approval" }` | 200, `{ runId: "wf-...", status: "running" }`; run created and first step (eventstorm) may start. |
| POST /api/workflow/resume with `{ runId }` | 200, `{ status, currentStep, completedSteps, artifacts }`; run advances until next manual checkpoint or completion. |
| GET /api/workflow/:id | 200, `{ runId, status, currentStep, completedSteps, artifacts, lastError? }`; 404 if runId unknown. |
| POST /api/workflow/abort with `{ runId }` | 200, `{ status: "aborted" }`; run no longer advances. |

### Eventstorm (step)

| Input | Output |
|-------|--------|
| POST /api/eventstorm/run with `{ domainName, problemStatement, constraints?, timeboxMinutes? }` | 200, `EventstormResult` (ubiquitousLanguage, domainEvents, commands, policies, aggregates, boundedContexts, openQuestions, mermaid); or 500 with message if facilitation fails. |

### Step result envelope (internal)

Every step returns a deterministic envelope: `{ status: 'ok'|'failed'|'needs_input', artifacts: [{ type, path, meta }], metrics: { durationMs, charsIn?, charsOut? }, errors: [] }`.

---

## Edge cases and corner cases

- **Empty or missing inputs:** `featureTitle` missing or empty string → 400. Optional fields may be omitted.
- **Invalid runId:** GET/POST resume/abort with non-existent runId → 404.
- **Step timeout:** Eventstorm (or other long step) exceeds timebox → step returns status `failed`, workflow run status may be `failed` or `waiting` depending on policy.
- **Manual checkpoint (tdd red):** After tdd_red, workflow status is `waiting_for_red_commit`; resume does not run tdd_green until client signals commit (or equivalent); resume after commit runs tdd_green.
- **Budget limits exceeded:** When budget policy limits retries or context size, step may fail after N retries; workflow does not silently skip gates (fail-closed).
- **Quality gate failure:** Lint or secure step fails → workflow run status reflects failure; artifacts up to that point remain available.

---

## Error cases

- **Invalid JSON from adapters:** Eventstorm (or other step) returns malformed JSON → step result status `failed`, errors array populated; workflow may retry according to budget or stop.
- **Missing artifacts:** Gate checks for artifact file/ref; if missing after step run → gate fails, step marked failed.
- **Auth failure:** Missing or invalid JWT or workflow token → 401.
- **Forbidden:** Valid auth but not allowed to perform action → 403.
- **Retry exceeded:** After max retries per step (e.g. 2), workflow stops and reports lastError; status `failed` or `needs_input`.

---

## Invariants

- Steps run in fixed order: eventstorm → c4 → spec → plan → beads → tdd_red → (manual commit) → tdd_green → lint → secure → doc.
- Workflow never skips quality gates; budget cannot disable gates (fail-closed).
- TDD: red phase must be confirmed (tests written and failing for the right reason) before green phase runs.
- At most one running workflow per runId; resume is idempotent for already-completed runs (returns current state).
- All step outputs are stored as artifacts with refs in workflow run state (SQLite + optional filesystem).

---

## Success criteria

- Workflow run can be started, persisted, and resumed; state is stored in SQLite (workflow_runs, workflow_artifacts, workflow_events).
- Pipeline runs in order: eventstorm → c4 → spec → plan → beads → tdd → lint → secure → doc; each step returns the standard result envelope.
- Gates are enforced (e.g. eventstorm output valid JSON with required keys; tdd_red requires user commit before tdd_green).
- Eventstorm step returns EventstormResult with at least: domainEvents, commands, aggregates, boundedContexts, openQuestions, mermaid.
- API is callable by the Cursor extension (HTTP); auth via JWT or X-Workflow-Token for local/dev.
- Unit tests cover workflowService (start, resume, step transition, gate evaluation) and eventstormService (runSession delegates to port, normalizes result).
- Integration test: workflow-api.test.js — start workflow, get run, resume (or abort), assert status and artifact refs.

---

## Test file hint

- **Unit — workflow:** `tests/business_modules/workflow/app/workflowService.test.js`
- **Unit — eventstorm:** `tests/business_modules/eventstorm/app/eventstormService.test.js`
- **Unit — gates:** `tests/business_modules/workflow/app/gates/gateRunner.test.js`
- **Integration — API:** `tests/integration/workflow-api.test.js` (or `tests/business_modules/workflow/input/workflowRouter.test.js` if testing router with in-memory repo)
