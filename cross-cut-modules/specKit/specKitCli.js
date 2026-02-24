'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

const SPEC_KIT_GIT = 'git+https://github.com/github/spec-kit.git';

/**
 * Run a spec-kit CLI command. Shared by spec and plan modules.
 * Env: SPECIFY_CLI_PATH (explicit executable); USE_SPECIFY_UVX=0 to use `specify` on PATH.
 * @param {string[]} args - e.g. ['check'], ['init', '.', '--force', '--ignore-agent-tools'], ['plan', '.']
 * @param {string} cwd - working directory (project root)
 * @param {object} [env] - optional env overrides
 * @returns {Promise<{ ok: boolean, stdout: string, stderr: string, code: number | null }>}
 */
function runSpecify(args, cwd, env = {}) {
  return new Promise((resolve) => {
    const useUvx = process.env.USE_SPECIFY_UVX !== '0';
    const cliPath = process.env.SPECIFY_CLI_PATH;
    let cmd;
    let cmdArgs;
    if (cliPath) {
      cmd = cliPath;
      cmdArgs = [...args];
    } else if (useUvx) {
      cmd = 'uvx';
      cmdArgs = ['--from', SPEC_KIT_GIT, 'specify', ...args];
    } else {
      cmd = 'specify';
      cmdArgs = [...args];
    }
    const proc = spawn(cmd, cmdArgs, {
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
 * Run `specify check`.
 */
async function runSpecifyCheck(projectRoot) {
  return runSpecify(['check'], projectRoot);
}

/**
 * Ensure .specify exists; if not, run `specify init . --force --ignore-agent-tools`.
 */
async function ensureSpecifyInited(projectRoot) {
  const specifyDir = path.join(projectRoot, '.specify');
  try {
    await fs.access(specifyDir);
    return { ok: true };
  } catch {
    // .specify missing; try to init
  }
  const result = await runSpecify(['init', '.', '--force', '--ignore-agent-tools'], projectRoot);
  if (!result.ok) {
    return {
      ok: false,
      message: `specify init failed: ${result.stderr || result.stdout || 'unknown'}. Run 'specify init .' in the project.`,
    };
  }
  return { ok: true };
}

/**
 * Run `specify plan` for the project (generates plan from .specify/specs). May not exist in all spec-kit versions.
 * @param {string} projectRoot
 * @param {string} [slug] - optional spec slug (e.g. 001-feature-name) if CLI supports it
 * @returns {Promise<{ ok: boolean, stdout: string, stderr: string, code: number | null }>}
 */
async function runSpecifyPlan(projectRoot, slug) {
  const args = slug ? ['plan', '.', '--spec', slug] : ['plan', '.'];
  return runSpecify(args, projectRoot);
}

module.exports = {
  runSpecify,
  runSpecifyCheck,
  ensureSpecifyInited,
  runSpecifyPlan,
};
