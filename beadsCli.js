'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

/**
 * Run the beads (bd) CLI. Env: BEADS_CLI_PATH for explicit executable; otherwise uses `bd` on PATH.
 * @param {string[]} args - e.g. ['init', '--quiet'], ['ready', '--json']
 * @param {string} cwd - working directory (project root)
 * @param {object} [env] - optional env overrides
 * @returns {Promise<{ ok: boolean, stdout: string, stderr: string, code: number | null }>}
 */
function runBd(args, cwd, env = {}) {
  return new Promise((resolve) => {
    const cmd = process.env.BEADS_CLI_PATH || 'bd';
    const proc = spawn(cmd, args, {
      cwd,
      shell: true,
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (c) => (stdout += c.toString()));
    proc.stderr?.on('data', (c) => (stderr += c.toString()));
    proc.on('close', (code) => {
      resolve({
        ok: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        code: code ?? null,
      });
    });
    proc.on('error', (err) => {
      resolve({ ok: false, stdout: '', stderr: err.message, code: null });
    });
  });
}

/**
 * Run `bd init` in project. Use --quiet for non-interactive (e.g. agents/CI).
 */
async function runBdInit(projectRoot, options = {}) {
  const args = options.quiet !== false ? ['init', '--quiet'] : ['init'];
  return runBd(args, projectRoot);
}

/**
 * Run `bd ready` to list tasks with no open blockers.
 */
async function runBdReady(projectRoot, options = {}) {
  const args = options.json ? ['ready', '--json'] : ['ready'];
  return runBd(args, projectRoot);
}

/**
 * Run `bd add <title>` to create a new task in the beads task graph.
 * @param {string} projectRoot
 * @param {string} title - Task title
 * @returns {Promise<{ ok: boolean, stdout: string, stderr: string, code: number | null }>}
 */
async function runBdAdd(projectRoot, title) {
  return runBd(['add', title], projectRoot);
}

/**
 * Parse a markdown plan file and extract task titles.
 * Recognises GFM task-list items (- [ ] / - [x]) and top-level plain bullets (- / *).
 * @param {string} markdown
 * @returns {string[]} Ordered list of task title strings
 */
function parsePlanMarkdown(markdown) {
  const lines = (markdown || '').split('\n');
  const tasks = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // GFM task list: - [ ] Title  or  - [x] Title
    const taskMatch = trimmed.match(/^-\s*\[[ xX]\]\s+(.+)/);
    if (taskMatch) {
      tasks.push(taskMatch[1].trim());
      continue;
    }
    // Top-level plain bullet (no indentation): - Title  or  * Title
    // Skip very short items (≤2 chars) which are likely formatting noise, not real tasks
    const bulletMatch = line.match(/^[-*]\s+(?!\[)(.+)/);
    if (bulletMatch && bulletMatch[1].trim().length > 2) {
      tasks.push(bulletMatch[1].trim());
    }
  }
  return tasks;
}

/**
 * Check if .beads exists in project (already inited).
 */
async function isBeadsInited(projectRoot) {
  const dir = path.join(projectRoot, '.beads');
  try {
    await fs.access(dir);
    return true;
  } catch {
    return false;
  }
}

const SDLC_RUN_STATE_FILENAME = 'sdlc-run-state.json';

/**
 * Write workflow run state under .beads so agents and tools see pipeline state.
 * Caller must ensure .beads exists (e.g. after bd init). Overwrites existing file.
 * @param {string} projectRoot - Repo root
 * @param {object} state - { runId, featureTitle, status, currentStep, completedSteps, stepNames, updatedAt }
 * @returns {Promise<void>}
 */
async function writeSdlcRunState(projectRoot, state) {
  const dir = path.join(projectRoot, '.beads');
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, SDLC_RUN_STATE_FILENAME);
  const payload = {
    runId: state.runId,
    featureTitle: state.featureTitle,
    status: state.status,
    currentStep: state.currentStep,
    completedSteps: state.completedSteps || [],
    stepNames: state.stepNames || [],
    updatedAt: state.updatedAt,
  };
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

module.exports = {
  runBd,
  runBdInit,
  runBdReady,
  runBdAdd,
  parsePlanMarkdown,
  isBeadsInited,
  writeSdlcRunState,
  SDLC_RUN_STATE_FILENAME,
};
