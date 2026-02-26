# Review: Plan Stage / Plan Module

**Scope:** Plan business module and plan workflow step (spec-kit used in two places: spec + plan).  
**Date:** 2025-02 (post-commit `fb959c0`).

---

## 1. Summary

The plan stage and plan module add a dedicated workflow step after **spec** that runs the spec-kit CLI (`specify plan`) to produce an implementation plan from the written spec. The design mirrors the spec module (port + service + controller + adapter), reuses root specKitCli.js, and fits the existing step envelope and artifact flow.

**Verdict:** Solid addition; a few follow-ups (tests, CLI contract, optional gate) are recommended.

---

## 2. How spec-kit is isolated between spec and plan

Spec-kit is split into **shared CLI** (root), **spec-only** behaviour (spec module), and **plan-only** behaviour (plan module).

### Shared (root specKitCli.js): one place for the CLI

**`specKitCli.js`** (project root) is the only place that talks to the `specify` process:

| Function | Role |
|----------|------|
| `runSpecify(args, cwd, env)` | Low-level: spawn `specify` (or `uvx --from … specify`). |
| `runSpecifyCheck(projectRoot)` | `specify check`. |
| `ensureSpecifyInited(projectRoot)` | `specify init . --force --ignore-agent-tools` if `.specify` is missing. |
| `ensureSpecKitReady(projectRoot, { useSpecKitPackage, autoInit })` | When `useSpecKitPackage`: check, then optional init; throws if not ready. **Used by both spec and plan.** |
| `runSpecifyPlan(projectRoot, slug)` | `specify plan .` (optionally `--spec <slug>`). **Used only by plan.** |

So: “how to run the spec-kit CLI” and “ensure env is ready” live in root specKitCli.js. There is no duplicated check/init logic.

### Spec module: “produce the spec document”

**Spec-only** spec-kit behaviour is “produce the spec file”:

- **Entry:** `SpecSpecKitAdapter` (implements `ISpecGenerationPort`) → calls **`specKitHelper.produceSpecWithSpecKit`**.
- **`spec/infrastructure/specKitHelper.js`** (spec-only):
  - Calls root **`ensureSpecKitReady`** (shared).
  - Then: **template** (`.specify/templates/spec-template.md`), **content** (eventstorm/c4 → `generateSpecMd` / `buildSpecFromTemplate`), **write** (`.specify/specs/<slug>/spec.md`).
- **Slug:** `featureSlug(featureTitle, runId)` lives in specKitHelper (spec-only).
- **No** `runSpecifyPlan` here; no plan-related CLI in the spec module.

So the **spec** module owns: “ensure ready, then build and write the spec from eventstorm/c4 (and optional template).”

### Plan module: “produce the plan from the spec”

**Plan-only** spec-kit behaviour is “run the plan command and expose the result”:

- **Entry:** `PlanService` (no port/adapter) → uses root specKitCli.js directly.
- **`plan/app/planService.js`**:
  - Calls root **`ensureSpecKitReady`** (same shared function as spec).
  - Then root **`runSpecifyPlan(projectRoot, slug)`** (plan-only usage of this function).
  - Derives **slug** from the spec artifact path (`slugFromSpecArtifacts(specArtifacts)`) so the CLI can target the right spec.
  - Checks for `plan.md`, builds the step envelope (artifacts, status, errors).
- **No** template, no eventstorm/c4, no `produceSpecWithSpecKit`; plan does not touch spec content or layout helpers.

So the **plan** module owns: “ensure ready, run `specify plan`, and return the plan artifact (or failure).”

### Summary

| Concern | Where it lives | Used by |
|--------|----------------|--------|
| Running the CLI (check, init, plan) | Root `specKitCli.js` | Both |
| “Ensure env ready” (check + optional init) | Root `ensureSpecKitReady` | Spec + Plan |
| “Produce spec” (template, eventstorm/c4, write spec.md) | Spec `specKitHelper` + `SpecSpecKitAdapter` | Spec only |
| “Produce plan” (run plan, slug from spec path, envelope) | Plan `PlanService` | Plan only |

So spec-kit **functionality** is isolated by step: spec = “write spec”; plan = “run plan.” The only shared behaviour is “ensure spec-kit is ready,” in one place (root specKitCli.js).

---

## 3. What Was Done Well

- **Layering and naming**
  - Clear split: `IPlanGenerationPort` (domain), `PlanService` / `PlanController` (app), `PlanSpecKitAdapter` (infrastructure). Matches the module-structure rules and is consistent with spec, c4, tdd, etc.

- **No input layer**
  - Plan is only invoked in-process by the workflow; no HTTP router was added. Correct per “input only when transport entry” and keeps the API surface minimal.

- **Shared spec-kit CLI**
  - Both spec and plan use root `specKitCli.js`. Single implementation for `runSpecify`, `runSpecifyCheck`, `ensureSpecifyInited`, and `runSpecifyPlan`; no duplication and consistent env (e.g. `USE_SPEC_KIT_PACKAGE`, `SPECIFY_AUTO_INIT`).

- **Config alignment with spec**
  - Plan adapter uses the same `config.useSpecKitPackage` and `config.specifyAutoInit`. When spec-kit is disabled, plan still runs `specify plan` (no check/init); when enabled, behavior matches spec (check, optional init, then plan). Sensible and consistent.

- **Slug derivation**
  - `slugFromSpecArtifacts()` supports string path, `{ path }`, and `[{ path }]`, which covers how the workflow stores spec artifacts (`artifacts.spec` = path or artifact). Robust for current and likely future shapes.

- **Step envelope**
  - Adapter returns the same shape as other steps: `status`, `artifacts`, `metrics.durationMs`, `errors`. Workflow’s artifact merge (`artifacts[a.type] = a.path ?? a`) correctly stores `artifacts.plan`.

- **Graceful handling of missing `plan.md`**
  - If `specify plan` succeeds but does not write `plan.md` (e.g. older CLI), the step still returns `ok` with empty artifacts instead of failing. Good for forward compatibility.

---

## 4. Risks and Gaps

- **CLI contract**
  - Public spec-kit docs emphasize slash commands (`/speckit.plan`) more than a `specify plan` CLI. If the installed CLI does not support `plan` (or uses different args), the plan step will fail with a clear error. Root `runSpecifyPlan(projectRoot, slug)` uses `['plan', '.']` or `['plan', '.', '--spec', slug]`; this should be updated to match the actual CLI once it’s fixed.

- **No exit criteria for plan**
  - Other steps (e.g. eventstorm) have `exitCriteria` (e.g. `requiredKeys`). Plan has none. If you want to gate on “plan artifact present” or “plan.md valid”, adding a plan step gate in `stepPlanFactory.js` would be the place.

- **Test coverage**
  - Only `PlanService` is unit-tested (delegation and error propagation). There are no tests for:
    - `PlanSpecKitAdapter` (e.g. slug extraction, behavior when `useSpecKitPackage` is false, failure paths),
    - `PlanController` (body extraction),
    - Integration of the plan step in the workflow (e.g. resume through plan, artifact storage).
  - Adding an adapter test (with a mocked or stubbed spec-kit CLI) and optionally a small workflow test would improve confidence.

- **Doc vs implementation**
  - The main spec doc mentions `POST /api/plan/run` in the step endpoints list. There is no plan router; the plan step is only run by the orchestrator. Either add the route for symmetry with other steps or adjust the doc to state that plan is orchestrator-only.

---

## 5. Consistency Check

| Aspect | Spec module | Plan module | Match? |
|--------|-------------|-------------|--------|
| Port in domain | `ISpecGenerationPort` | `IPlanGenerationPort` | Yes |
| Service delegates to port | Yes | Yes | Yes |
| Controller maps body → service | Yes | Yes | Yes |
| Adapter uses config + projectRoot | Yes | Yes | Yes |
| Uses root specKitCli | Yes (check, init, template, write) | Yes (check, init, plan) | Yes |
| Step body from executor | eventstorm + c4 + featureTitle | specArtifacts + featureTitle | Yes |
| No input layer (in-process only) | Yes | Yes | Yes |

---

## 6. Recommendations

1. **Add `PlanSpecKitAdapter` tests**
   - At least: slug extraction for string / `{ path }` / array; behavior when `specify plan` fails (status `failed`, errors); behavior when `plan.md` is missing after success (status `ok`, empty artifacts).

2. **Confirm spec-kit CLI**
   - Verify in the spec-kit repo or installed CLI whether `specify plan` exists and which arguments it accepts; update `runSpecifyPlan` in root `specKitCli.js` if needed.

3. **Optional: exit criteria for plan**
   - If the pipeline should not proceed without a plan artifact, add an exit criterion for the plan step (e.g. `fileExists` on the plan path or a small JSON structure check).

4. **Doc**
   - Either implement `POST /api/plan/run` (and a plan router) for parity with other steps, or update the spec doc to state that the plan step is invoked only by the workflow orchestrator.

---

## 7. Design concern: spec-kit spread and functional overlap

**Yes — spreading spec-kit across two modules and duplicating “ensure ready” is a design tension.**

### Where the overlap is

- **Spec module** (via `produceSpecWithSpecKit` in specKitHelper): when `useSpecKitPackage` → `runSpecifyCheck(projectRoot)` → if not ok and `autoInit` → `ensureSpecifyInited(projectRoot)` → then template + write spec.
- **Plan module** (PlanSpecKitAdapter): when `useSpecKitPackage` → `runSpecifyCheck(projectRoot)` → if not ok and `specifyAutoInit` → `ensureSpecifyInited(projectRoot)` → then `runSpecifyPlan(projectRoot, slug)`.

So the **same “ensure spec-kit is ready” logic** (check + optional init) lives in two places: spec’s helper and plan’s adapter. The *CLI runner* is shared (root specKitCli.js), but the *policy* (when to check, when to init, same config flags) is duplicated. If we add another spec-kit step (e.g. “tasks”), we’d repeat it a third time.

### Why it’s problematic

- **Single capability, two owners:** Spec-kit is one conceptual capability (init → spec → plan → tasks). Having “write spec” in the spec module and “run plan” in the plan module splits that capability across two business modules and suggests two separate concerns, even though both are “spec-kit steps.”
- **Duplicated policy:** Check + optional init is policy/behavior. Duplicating it risks drift (e.g. one module gets a new env flag and the other doesn’t) and makes changes harder.
- **JIT / “just-in-time” readiness:** Each step currently ensures readiness on its own. That’s defensive but redundant: after the spec step, .specify is already there, so the plan step’s check/init is usually a no-op. So we’re paying for duplicated code and repeated CLI calls for little benefit.

### Cleaner options

1. **Consolidate “ensure ready” in root specKitCli.js**  
   Add e.g. `ensureSpecKitReady(projectRoot, { useSpecKitPackage, autoInit })` in root `specKitCli.js`. Both spec and plan adapters call it once at the start of their `run()`; then each does only its specific work (template+write vs plan). Overlap becomes a single shared function instead of two copies of the same block.

2. **Single “speckit” (or “specKit”) business module**  
   One module that owns all spec-kit workflow steps: “spec” (write spec.md from eventstorm/c4) and “plan” (run specify plan) as two operations of the same module, with one port (or two ports) and one adapter that handles both. The workflow would still have two steps (spec, plan), but both would be implemented by the same module (e.g. `speckitController.run({ operation: 'spec' | 'plan', ... })`). Then spec-kit is one capability in one place; no spread, no duplicated check/init.

3. **Orchestrator guarantees readiness once**  
   The workflow runs “ensure spec-kit ready” once (e.g. before the spec step, or as a tiny pre-step / gate). Spec and plan adapters then assume `.specify` exists and only do their specific CLI call (write spec, run plan). Check/init lives in one place (workflow or a shared bootstrap); adapters stay thin.

Recommendation: at least do **(1)** to remove duplicated policy and keep two modules; if you want a single owner for spec-kit, consider **(2)**.

---

## 8. Conclusion

The plan stage and plan module are well-structured, consistent with the rest of the codebase, and correctly integrated into the workflow. The main follow-ups are tests for the adapter, alignment with the real spec-kit CLI, and optional gating and API documentation. Addressing the spec-kit spread and overlap (e.g. via shared `ensureSpecKitReady` or a single speckit module) would improve long-term maintainability.
