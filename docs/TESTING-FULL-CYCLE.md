# Testing the agent-sdlc-workflow full cycle

This describes how to run the SDLC workflow **full cycle**: start a run, then resume until the run reaches a terminal state (completed, failed, waiting_for_red_commit, or aborted).

## Prerequisites

- **Server running** — The API must be up. In one terminal:

  ```bash
  npm start
  ```

  Default: `http://127.0.0.1:8787` (override with `PORT` / `HOST` or `BASE_URL` when running the client).

- **Auth (optional)** — If `WORKFLOW_TOKEN` is set, the full-cycle script sends it as `X-Workflow-Token`.

- **Claude CLI (for eventstorm step)** — The eventstorm step runs the EventStorm session via the **Claude Code** CLI (`claude`). It is not an npm dependency; install it separately so the first step can succeed.

  **Install (pick one):**

  - **Native (recommended)** — macOS, Linux, WSL:
    ```bash
    curl -fsSL https://claude.ai/install.sh | bash
    ```
  - **Homebrew** (macOS):
    ```bash
    brew install --cask claude-code
    ```
  - **npm** (deprecated; use if you need it):
    ```bash
    npm install -g @anthropic-ai/claude-code
    ```

  Then ensure `claude` is on your PATH and authenticate (Pro/Max/Teams/Enterprise or Console account required; free Claude.ai does not include Claude Code):

  ```bash
  claude --version
  claude auth login   # or run `claude` and follow the browser prompts
  ```

  See [Anthropic Claude Code setup](https://docs.anthropic.com/en/docs/claude-code/setup) for details and Windows options.

## Run the full cycle

1. Start the server (see above).

2. In another terminal, run:

   ```bash
   npm run full-cycle
   ```

   Or with a custom feature title and base URL:

   ```bash
   node scripts/run-full-cycle.js "refund approval"
   BASE_URL=http://localhost:8787 node scripts/run-full-cycle.js "my feature"
   ```

3. The script will:

   - Call `GET /health` to ensure the server is up.
   - Call `POST /api/workflow/start` with the feature title.
   - Call `POST /api/workflow/resume` repeatedly until status is one of: `completed`, `failed`, `waiting_for_red_commit`, `aborted`.
   - Print each resume result (status, currentStep, completedSteps, and any lastError).

## What to expect

- **eventstorm** is the first step; it uses the Claude Code CLI (see [Claude CLI](#claude-cli-for-eventstorm-step) above). If `claude` is not installed or auth fails, the run may **fail** after retries.
- After **plan**, the **beads** step runs (optional; fails open if `bd` is not available).
- **tdd_red** is a **manual checkpoint**: the workflow stops with status `waiting_for_red_commit`. To continue, call `POST /api/workflow/resume` again (e.g. after committing); the script will stop there and report that status.
- The pipeline order is: eventstorm → c4 → spec → plan → beads → tdd_red (manual) → tdd_green → lint → secure → doc.

## Manual API usage

You can drive the cycle manually with curl:

```bash
# Start
curl -s -X POST http://127.0.0.1:8787/api/workflow/start \
  -H "Content-Type: application/json" \
  -d '{"featureTitle":"refund approval"}' | jq

# Resume (use runId from start response)
curl -s -X POST http://127.0.0.1:8787/api/workflow/resume \
  -H "Content-Type: application/json" \
  -d '{"runId":"wf-..."}' | jq

# Get run state
curl -s http://127.0.0.1:8787/api/workflow/wf-... | jq
```

## Unit and integration tests

- **Unit tests** (workflow service, step plan, gates, eventstorm, etc.): `npm test`
- **Integration test** (workflow API with in-memory container): included in `npm test` via `tests/integration/workflow-api.test.js`

Those tests do not run the real eventstorm/Claude step; they assert start, get, abort, and auth behavior.
