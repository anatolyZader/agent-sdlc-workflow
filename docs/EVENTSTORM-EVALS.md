# EventStorm evaluation layer

The EventStorm stage is evaluated like a **compiler pipeline**: deterministic structural checks on `summary.json`, no Markdown evaluation, optional LLM judge for semantic grading.

## Layout

- **tests/eventstorm/**
  - **summarySchema.json** – JSON Schema for `summary.json` (enforced via Ajv).
  - **eventstormEvaluator.js** – Schema validation + cross-link integrity, orphan detection, invariant sanity, contradiction gate, coverage.
  - **eventstorm.eval.test.js** – Unit tests for the evaluator and golden fixture run.
  - **runGoldenCases.js** – Pipeline: optionally spawn CLI, then validate + structural checks per golden case.
  - **judge.prompt.md** – Prompt for optional LLM judge (run nightly; `claude -p "..."` with summary content).
  - **baseline.json** – Optional drift baseline (hash of `.claude/agents/*`); rebaseline when prompts change.
  - **golden/** – One directory per case, e.g. `billing-refunds/`, `video-processing-pipeline/`.
    - **input.json** – Session input (domainName, problemStatement, constraints, or rawText).
    - **expected.assertions.json** – `expectContradictions`, `minCommands`, `minEvents`, `minAggregates`, `minBoundedContexts`, `requireInvariantModals`, `allowEmptyInvariants`.
    - **fixture.summary.json** – Optional; used when not running the CLI (CI-friendly).

## Commands

- **npm run test:eventstorm** – Run evaluator tests and golden pipeline **without** spawning the Claude agent (uses fixtures). No auth required.
- **npm run test:eventstorm:cli** – Run golden pipeline **with** `claude --agent eventstorm-coordinator` per case; then validate and run structural checks on produced `docs/eventstorm/<sessionId>/summary.json`. Requires `claude` on PATH and auth.

## Pipeline (per golden case)

1. **Spawn CLI** (only when `RUN_EVENTSTORM_CLI=1`):  
   `claude --agent eventstorm-coordinator -p "<constructed prompt>"`  
   Wait for exit code 0; if non-zero → FAIL.
2. **Validate** `summary.json` with JSON Schema (Ajv).
3. **Structural checks**: cross-link integrity, orphan detection, invariant sanity, contradiction gate, coverage (min counts from `expected.assertions.json`).

## Deterministic checks (no LLM)

- **Cross-link**: Every aggregate `ownsCommands`/`emitsEvents`, policy `trigger`/`emits`, reference existing commands/events.
- **Orphans**: Every event has an emitter; every aggregate has ≥1 invariant; every bounded context has ≥1 responsibility.
- **Invariant sanity**: Invariants contain modal verbs (must, cannot, at most, only if, etc.) unless `allowEmptyInvariants`.
- **Contradiction gate**: If `contradictions.length > 0` and case does not `expectContradictions` → FAIL.
- **Coverage**: Enforce `minCommands`, `minEvents`, `minAggregates`, `minBoundedContexts` from assertions.

## Optional: LLM judge

For semantic grading (fidelity, coherence, aggregate_quality, bc_quality, spec_actionability), run the judge separately (e.g. nightly):

```bash
# Build judge input: judge.prompt.md + summary.json content, then:
claude -p "$(cat tests/eventstorm/judge.prompt.md) $(cat docs/eventstorm/<sessionId>/summary.json)"
```

Thresholds: fidelity === 2, coherence >= 1, aggregate_quality >= 1.

## Drift baseline

When you change `.claude/agents/*` (coordinator or subagent prompts), update the baseline:

```bash
node tests/eventstorm/computeBaseline.js --update
```

In CI you can compare current `agentsHash` to `tests/eventstorm/baseline.json` and require a rebaseline PR when the hash changes.
