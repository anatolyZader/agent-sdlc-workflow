'use strict';

const path = require('path');
const fs = require('fs');
const { ITddRunPort } = require('../../domain/ports/ITddRunPort');

/**
 * TDD runner: runRed = scaffold + generate tests from spec + run tests (expect fail);
 * runGreen = run tests (expect pass). Implements ITddRunPort.
 */
class TddRunnerAdapter extends ITddRunPort {
  constructor({ tddModuleScaffoldPort, tddTestGeneratorPort, tddTestRunnerPort, config }) {
    super();
    this.scaffoldPort = tddModuleScaffoldPort;
    this.generatorPort = tddTestGeneratorPort;
    this.runnerPort = tddTestRunnerPort;
    this.projectRoot = config?.projectRoot || process.cwd();
  }

  async runRed(inputs) {
    const start = Date.now();
    const moduleName = inputs.moduleName || inputs.run?.featureTitle || 'unknown';
    const specPath = inputs.specPath || inputs.run?.artifacts?.spec || inputs.specArtifacts?.path || 'docs/specs/spec-agent-sdlc-workflow.md';

    try {
      await this.scaffoldPort.ensureScaffold(moduleName, this.projectRoot);
      const { testPaths, errors: genErrors } = await this.generatorPort.generateFromSpec(specPath, moduleName, this.projectRoot);
      if (genErrors.length) {
        return { status: 'failed', artifacts: [], metrics: { durationMs: Date.now() - start }, errors: genErrors };
      }
      if (!testPaths || testPaths.length === 0) {
        return { status: 'failed', artifacts: [], metrics: { durationMs: Date.now() - start }, errors: ['No tests generated'] };
      }
      const result = await this.runnerPort.runTests(testPaths, this.projectRoot);
      const durationMs = Date.now() - start;
      if (result.passed) {
        return {
          status: 'failed',
          artifacts: [],
          metrics: { durationMs },
          errors: ['Red phase: tests should fail but they passed'],
        };
      }
      return {
        status: 'ok',
        artifacts: testPaths.map((p) => ({ type: 'test', path: p, meta: { phase: 'red' } })),
        metrics: { durationMs },
        errors: [],
      };
    } catch (err) {
      return {
        status: 'failed',
        artifacts: [],
        metrics: { durationMs: Date.now() - start },
        errors: [err.message || String(err)],
      };
    }
  }

  async runGreen(inputs) {
    const start = Date.now();
    const moduleName = inputs.moduleName || inputs.run?.featureTitle || 'unknown';
    const testPaths = inputs.testPaths || inputs.run?.artifacts?.testPaths;
    const projectRoot = this.projectRoot;

    try {
      let pathsToRun = testPaths;
      if (!pathsToRun || pathsToRun.length === 0) {
        const testDir = path.join(projectRoot, 'tests', 'business_modules', moduleName, 'app');
        if (fs.existsSync(testDir)) {
          pathsToRun = fs.readdirSync(testDir).filter((f) => f.endsWith('.test.js')).map((f) => path.join(testDir, f));
        }
      }
      if (!pathsToRun || pathsToRun.length === 0) {
        return {
          status: 'failed',
          artifacts: [],
          metrics: { durationMs: Date.now() - start },
          errors: ['No test paths to run for green phase'],
        };
      }
      const result = await this.runnerPort.runTests(pathsToRun, projectRoot);
      const durationMs = Date.now() - start;
      if (result.passed) {
        return { status: 'ok', artifacts: [], metrics: { durationMs }, errors: [] };
      }
      return {
        status: 'failed',
        artifacts: [],
        metrics: { durationMs },
        errors: result.errors.length ? result.errors : [result.output || 'Tests failed'],
      };
    } catch (err) {
      return {
        status: 'failed',
        artifacts: [],
        metrics: { durationMs: Date.now() - start },
        errors: [err.message || String(err)],
      };
    }
  }
}

module.exports = { TddRunnerAdapter };
