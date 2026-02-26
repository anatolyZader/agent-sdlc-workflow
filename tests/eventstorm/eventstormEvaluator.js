'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv').default;

const INVARIANT_MODALS = /\b(must|cannot|may not|at most|at least|exactly|only if|never|always)\b/i;

/**
 * Evaluation layer for EventStorm summary.json: schema validation + structural checks.
 * No Markdown evaluation; no LLM in the critical path.
 */
class EventstormEvaluator {
  /**
   * @param {object} [options]
   * @param {string} [options.schemaPath] - path to summarySchema.json
   */
  constructor(options = {}) {
    const testsDir = path.resolve(__dirname);
    this.schemaPath = options.schemaPath ?? path.join(testsDir, 'summarySchema.json');
    this._ajv = new Ajv({ strict: false, allErrors: true });
    this._schema = JSON.parse(fs.readFileSync(this.schemaPath, 'utf8'));
    this._validateSchemaFn = this._ajv.compile(this._schema);
  }

  /**
   * Load and parse summary.json from a file path or directory (looks for summary.json inside).
   * @param {string} pathOrDir - path to summary.json or to dir containing summary.json
   * @returns {object}
   */
  loadSummary(pathOrDir) {
    const p = pathOrDir.endsWith('summary.json')
      ? pathOrDir
      : path.join(pathOrDir, 'summary.json');
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  }

  /**
   * Run all checks. Returns { passed: boolean, failures: string[] }.
   * @param {object} summary - parsed summary.json
   * @param {object} [assertions] - expected.assertions.json shape
   */
  runAll(summary, assertions = {}) {
    const failures = [];

    const schemaOk = this.validateSchema(summary);
    if (!schemaOk.valid) {
      failures.push(...schemaOk.errors);
    }

    const crossLink = this.crossLinkIntegrity(summary);
    failures.push(...crossLink.failures);

    const orphans = this.orphanDetection(summary);
    failures.push(...orphans.failures);

    const invariantOpts = {
      requireModals: assertions.requireInvariantModals !== false,
      allowEmpty: assertions.allowEmptyInvariants === true,
    };
    const inv = this.invariantSanity(summary, invariantOpts);
    failures.push(...inv.failures);

    const contradict = this.contradictionGate(
      summary,
      assertions.expectContradictions === true
    );
    if (contradict.failure) failures.push(contradict.failure);

    const coverage = this.coverageChecks(summary, assertions);
    failures.push(...coverage.failures);

    return {
      passed: failures.length === 0,
      failures,
    };
  }

  /**
   * Validate summary against JSON Schema.
   * @param {object} summary
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateSchema(summary) {
    const valid = this._validateSchemaFn(summary);
    if (valid) return { valid: true, errors: [] };
    const errors = (this._validateSchemaFn.errors || []).map(
      (e) => `Schema: ${e.instancePath} ${e.message}`
    );
    return { valid: false, errors };
  }

  /**
   * Cross-reference integrity: every referenced command/event/aggregate exists.
   * @param {object} summary
   * @returns {{ passed: boolean, failures: string[] }}
   */
  crossLinkIntegrity(summary) {
    const failures = [];
    const commandNames = new Set((summary.commands || []).map((c) => c.name));
    const eventNames = new Set((summary.events || []).map((e) => e.name));
    const aggregateNames = new Set((summary.aggregates || []).map((a) => a.name));

    for (const agg of summary.aggregates || []) {
      for (const cmd of agg.ownsCommands || []) {
        if (!commandNames.has(cmd)) {
          failures.push(`Cross-link: aggregate "${agg.name}" references non-existent command "${cmd}"`);
        }
      }
      for (const evt of agg.emitsEvents || []) {
        if (!eventNames.has(evt)) {
          failures.push(`Cross-link: aggregate "${agg.name}" references non-existent event "${evt}"`);
        }
      }
    }

    for (const policy of summary.policies || []) {
      const trigger = policy.trigger;
      if (trigger && !commandNames.has(trigger) && !eventNames.has(trigger)) {
        failures.push(`Cross-link: policy trigger "${trigger}" is not a known command or event`);
      }
      for (const emitted of policy.emits || []) {
        if (!eventNames.has(emitted)) {
          failures.push(`Cross-link: policy emits non-existent event "${emitted}"`);
        }
      }
    }

    return {
      passed: failures.length === 0,
      failures,
    };
  }

  /**
   * Orphan detection: commands with no event, events with no emitter, aggregates with no invariant, BCs with no responsibilities.
   * @param {object} summary
   * @returns {{ passed: boolean, failures: string[] }}
   */
  orphanDetection(summary) {
    const failures = [];
    const emittedEvents = new Set();
    for (const agg of summary.aggregates || []) {
      for (const e of agg.emitsEvents || []) emittedEvents.add(e);
    }
    for (const p of summary.policies || []) {
      for (const e of p.emits || []) emittedEvents.add(e);
    }

    const commandNames = new Set((summary.commands || []).map((c) => c.name));
    for (const evt of summary.events || []) {
      if (!emittedEvents.has(evt.name)) {
        failures.push(`Orphan: event "${evt.name}" has no emitter (aggregate or policy)`);
      }
    }

    for (const agg of summary.aggregates || []) {
      const invs = agg.invariants || [];
      if (invs.length === 0) {
        failures.push(`Orphan: aggregate "${agg.name}" has no invariants`);
      }
    }

    for (const bc of summary.boundedContexts || []) {
      const resp = bc.responsibilities || [];
      if (resp.length === 0) {
        failures.push(`Orphan: bounded context "${bc.name}" has no responsibilities`);
      }
    }

    return {
      passed: failures.length === 0,
      failures,
    };
  }

  /**
   * Invariant sanity: invariants should contain modal verbs (must, cannot, etc.) unless allowEmpty.
   * @param {object} summary
   * @param {object} [options]
   * @param {boolean} [options.requireModals=true]
   * @param {boolean} [options.allowEmpty=false]
   * @returns {{ passed: boolean, failures: string[] }}
   */
  invariantSanity(summary, options = {}) {
    const { requireModals = true, allowEmpty = false } = options;
    const failures = [];

    for (const agg of summary.aggregates || []) {
      const invs = agg.invariants || [];
      if (invs.length === 0 && !allowEmpty) {
        continue; // already reported in orphanDetection if we care
      }
      for (const inv of invs) {
        if (requireModals && !INVARIANT_MODALS.test(inv)) {
          const snippet = inv.length > 60 ? `${inv.slice(0, 60)}...` : inv;
          failures.push(
            `Invariant sanity: aggregate "${agg.name}" invariant "${snippet}" has no modal (must/cannot/at most/only if)`
          );
        }
      }
    }

    return {
      passed: failures.length === 0,
      failures,
    };
  }

  /**
   * Contradiction gate: if contradictions.length > 0 and we don't expect them, fail.
   * @param {object} summary
   * @param {boolean} expectContradictions
   * @returns {{ passed: boolean, failure?: string }}
   */
  contradictionGate(summary, expectContradictions = false) {
    const list = summary.contradictions || [];
    if (list.length === 0) return { passed: true };
    if (expectContradictions) return { passed: true };
    return {
      passed: false,
      failure: `Contradiction gate: ${list.length} contradiction(s) found; run must resolve or list in openQuestions. First: ${list[0]}`,
    };
  }

  /**
   * Coverage: minimum counts from expected.assertions.json.
   * @param {object} summary
   * @param {object} assertions
   * @returns {{ passed: boolean, failures: string[] }}
   */
  coverageChecks(summary, assertions = {}) {
    const failures = [];
    const commands = summary.commands || [];
    const events = summary.events || [];
    const aggregates = summary.aggregates || [];
    const bcs = summary.boundedContexts || [];

    if (assertions.minCommands != null && commands.length < assertions.minCommands) {
      failures.push(`Coverage: commands ${commands.length} < minCommands ${assertions.minCommands}`);
    }
    if (assertions.minEvents != null && events.length < assertions.minEvents) {
      failures.push(`Coverage: events ${events.length} < minEvents ${assertions.minEvents}`);
    }
    if (assertions.minAggregates != null && aggregates.length < assertions.minAggregates) {
      failures.push(`Coverage: aggregates ${aggregates.length} < minAggregates ${assertions.minAggregates}`);
    }
    if (assertions.minBoundedContexts != null && bcs.length < assertions.minBoundedContexts) {
      failures.push(`Coverage: boundedContexts ${bcs.length} < minBoundedContexts ${assertions.minBoundedContexts}`);
    }

    return {
      passed: failures.length === 0,
      failures,
    };
  }
}

module.exports = { EventstormEvaluator };
