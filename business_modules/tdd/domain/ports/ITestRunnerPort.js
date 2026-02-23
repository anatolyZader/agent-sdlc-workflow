'use strict';

/**
 * Port: run tests (e.g. node --test) and return pass/fail and output.
 * @interface
 */
function ITestRunnerPort() {
  if (new.target === ITestRunnerPort) {
    throw new Error('ITestRunnerPort is abstract');
  }
}

/**
 * @param {string[]} testPaths - paths to test files or dirs
 * @param {string} projectRoot - absolute path to project root
 * @returns {Promise<{ passed: boolean, exitCode: number, output: string, errors: string[] }>}
 */
ITestRunnerPort.prototype.runTests = function (testPaths, projectRoot) {
  throw new Error('runTests not implemented');
};

module.exports = { ITestRunnerPort };
