'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { ITestRunnerPort } = require('../../domain/ports/ITestRunnerPort');

/**
 * Runs tests via node --test. Implements ITestRunnerPort.
 */
class TddTestRunnerAdapter extends ITestRunnerPort {
  runTests(testPaths, projectRoot) {
    const root = path.resolve(projectRoot);
    if (!testPaths || testPaths.length === 0) {
      return Promise.resolve({
        passed: false,
        exitCode: 1,
        output: '',
        errors: ['No test paths provided'],
      });
    }
    const args = ['--test', ...testPaths.map((p) => (path.isAbsolute(p) ? p : path.join(root, p)))];
    return new Promise((resolve) => {
      const child = spawn(process.execPath, args, {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (ch) => (stdout += ch));
      child.stderr.on('data', (ch) => (stderr += ch));
      child.on('close', (exitCode) => {
        resolve({
          passed: exitCode === 0,
          exitCode: exitCode ?? 1,
          output: stdout + stderr,
          errors: exitCode === 0 ? [] : [stderr || stdout || 'Tests failed'],
        });
      });
      child.on('error', (err) => {
        resolve({
          passed: false,
          exitCode: 1,
          output: err.message,
          errors: [err.message],
        });
      });
    });
  }
}

module.exports = { TddTestRunnerAdapter };
