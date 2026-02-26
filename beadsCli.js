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
  isBeadsInited,
  writeSdlcRunState,
  SDLC_RUN_STATE_FILENAME,
};
