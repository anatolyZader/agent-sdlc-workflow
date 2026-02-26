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

function runSpecifyCheck(projectRoot) {
  return runSpecify(['check'], projectRoot);
}

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

async function runSpecifyPlan(projectRoot, slug) {
  const args = slug ? ['plan', '.', '--spec', slug] : ['plan', '.'];
  return runSpecify(args, projectRoot);
}

const SPEC_KIT_INSTALL_HINT =
  'Install: uv tool install specify-cli --from git+https://github.com/github/spec-kit.git ; then run specify init . in the project.';

async function ensureSpecKitReady(projectRoot, options = {}) {
  const { useSpecKitPackage = false, autoInit = false } = options;
  if (!useSpecKitPackage) return;

  const checkResult = await runSpecifyCheck(projectRoot);
  if (checkResult.ok) return;

  if (autoInit) {
    const initResult = await ensureSpecifyInited(projectRoot);
    if (!initResult.ok) {
      throw new Error(initResult.message || `specify init failed. ${SPEC_KIT_INSTALL_HINT}`);
    }
    return;
  }

  throw new Error(
    `Spec-kit required. ${SPEC_KIT_INSTALL_HINT} ` +
      (checkResult.stderr || checkResult.stdout || '')
  );
}

module.exports = {
  runSpecify,
  runSpecifyCheck,
  ensureSpecifyInited,
  runSpecifyPlan,
  ensureSpecKitReady,
};
