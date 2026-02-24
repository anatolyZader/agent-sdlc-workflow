'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

const SPEC_KIT_GIT = 'git+https://github.com/github/spec-kit.git';

/**
 * Run a spec-kit CLI command.
 * Env: SPECIFY_CLI_PATH (explicit executable); USE_SPECIFY_UVX=0 to use `specify` on PATH.
 * @param {string[]} args - e.g. ['check'] or ['init', '.', '--force', '--ignore-agent-tools']
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
 * Run `specify check`. Fails if spec-kit is not installed or project not inited (depending on check behavior).
 */
async function runSpecifyCheck(projectRoot) {
  const result = await runSpecify(['check'], projectRoot);
  return result;
}

/**
 * Ensure .specify exists; if not, run `specify init . --force --ignore-agent-tools`.
 * @param {string} projectRoot
 * @returns {Promise<{ ok: boolean, message?: string }>}
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

module.exports = {
  runSpecify,
  runSpecifyCheck,
  ensureSpecifyInited,
};
