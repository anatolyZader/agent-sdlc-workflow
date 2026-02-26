'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { EventstormEvaluator } = require('./eventstormEvaluator.js');

const GOLDEN_DIR = path.join(__dirname, 'golden');

describe('EventstormEvaluator', () => {
  describe('validateSchema', () => {
    it('passes for valid fixture summary', () => {
      const evaluator = new EventstormEvaluator();
      const summary = evaluator.loadSummary(path.join(GOLDEN_DIR, 'billing-refunds', 'fixture.summary.json'));
      const result = evaluator.validateSchema(summary);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('fails for missing required fields', () => {
      const evaluator = new EventstormEvaluator();
      const result = evaluator.validateSchema({ goal: 'x' });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0);
    });
  });

  describe('crossLinkIntegrity', () => {
    it('passes when all references exist', () => {
      const evaluator = new EventstormEvaluator();
      const summary = evaluator.loadSummary(path.join(GOLDEN_DIR, 'billing-refunds', 'fixture.summary.json'));
      const result = evaluator.crossLinkIntegrity(summary);
      assert.strictEqual(result.passed, true);
      assert.strictEqual(result.failures.length, 0);
    });

    it('fails when aggregate references non-existent command', () => {
      const evaluator = new EventstormEvaluator();
      const summary = evaluator.loadSummary(path.join(GOLDEN_DIR, 'billing-refunds', 'fixture.summary.json'));
      summary.aggregates[0].ownsCommands.push('NonExistentCommand');
      const result = evaluator.crossLinkIntegrity(summary);
      assert.strictEqual(result.passed, false);
      assert.ok(result.failures.some((f) => f.includes('non-existent command')));
    });
  });

  describe('contradictionGate', () => {
    it('fails when contradictions present and not expected', () => {
      const evaluator = new EventstormEvaluator();
      const summary = { contradictions: ['Term X means two things'] };
      const result = evaluator.contradictionGate(summary, false);
      assert.strictEqual(result.passed, false);
      assert.ok(result.failure);
    });

    it('passes when contradictions expected', () => {
      const evaluator = new EventstormEvaluator();
      const summary = { contradictions: ['Ambiguous'] };
      const result = evaluator.contradictionGate(summary, true);
      assert.strictEqual(result.passed, true);
    });
  });

  describe('runAll on golden fixture', () => {
    it('passes for billing-refunds fixture with expected.assertions', () => {
      const evaluator = new EventstormEvaluator();
      const summaryPath = path.join(GOLDEN_DIR, 'billing-refunds', 'fixture.summary.json');
      const summary = evaluator.loadSummary(summaryPath);
      const assertionsPath = path.join(GOLDEN_DIR, 'billing-refunds', 'expected.assertions.json');
      const assertions = JSON.parse(fs.readFileSync(assertionsPath, 'utf8'));
      const result = evaluator.runAll(summary, assertions);
      assert.strictEqual(result.passed, true, result.failures.join('; '));
      assert.strictEqual(result.failures.length, 0);
    });
  });

  describe('golden case discovery', () => {
    it('each golden case has input.json and expected.assertions.json', () => {
      const cases = fs.readdirSync(GOLDEN_DIR).filter((name) => {
        const stat = fs.statSync(path.join(GOLDEN_DIR, name));
        return stat.isDirectory();
      });
      for (const name of cases) {
        const dir = path.join(GOLDEN_DIR, name);
        assert.ok(fs.existsSync(path.join(dir, 'input.json')), `${name}: missing input.json`);
        assert.ok(fs.existsSync(path.join(dir, 'expected.assertions.json')), `${name}: missing expected.assertions.json`);
      }
    });
  });
});
