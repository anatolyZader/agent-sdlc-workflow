'use strict';

const { IWorkflowStepExecutorPort } = require('../../domain/ports/IWorkflowStepExecutorPort');

/**
 * Runs workflow steps by calling step controllers in-process. Implements IWorkflowStepExecutorPort.
 * Maps stepName to controller.run(request) with body derived from run/plan.
 */
class InProcessStepExecutorAdapter extends IWorkflowStepExecutorPort {
  constructor({
    eventstormController,
    c4Controller,
    specController,
    planController,
    beadsController,
    tddController,
    lintController,
    secureController,
    docController,
    config,
  }) {
    super();
    this.controllers = {
      eventstorm: eventstormController,
      c4: c4Controller,
      spec: specController,
      plan: planController,
      beads: beadsController,
      tdd_red: tddController,
      tdd_green: tddController,
      lint: lintController,
      secure: secureController,
      doc: docController,
    };
    this.stepTimeoutMs = config?.stepTimeoutMs ?? 300000;
  }

  async runStep(params) {
    const { stepName, inputs } = params;
    const { run, plan } = inputs || {};
    const controller = this.controllers[stepName];
    if (!controller) {
      return { status: 'failed', artifacts: [], metrics: { durationMs: 0 }, errors: [`Unknown step: ${stepName}`] };
    }
    const timeoutMs = this.stepTimeoutMs;
    let signal;
    let timeoutId;
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      signal = AbortSignal.timeout(timeoutMs);
    } else {
      const ac = new AbortController();
      signal = ac.signal;
      timeoutId = setTimeout(() => ac.abort(), timeoutMs);
    }
    const request = { body: this._bodyForStep(stepName, run), signal };
    const start = Date.now();
    try {
      const result = await controller.run(request);
      const durationMs = Date.now() - start;
      return this._toEnvelope(stepName, result, durationMs);
    } catch (err) {
      const durationMs = Date.now() - start;
      return {
        status: 'failed',
        artifacts: [],
        metrics: { durationMs },
        errors: [err.message || String(err)],
        logs: [],
        errorType: err.errorType,
      };
    } finally {
      if (timeoutId != null) clearTimeout(timeoutId);
    }
  }

  /**
   * Resolves artifact path or legacy value for downstream steps. Supports normalized shape
   * { type, path, meta } and legacy string path. Returns undefined when the artifact is not provided or has no path.
   * @param {object} artifacts - run.artifacts
   * @param {string} type - artifact type (e.g. 'eventstorm', 'c4', 'spec')
   * @returns {string|object|undefined} path string, or legacy artifact value, or undefined
   */
  _getArtifactPath(artifacts, type) {
    const a = artifacts[type];
    if (a == null) return undefined;
    if (typeof a === 'object' && a !== null && 'path' in a) return a.path ?? undefined;
    return a;
  }

  _bodyForStep(stepName, run) {
    const r = run || {};
    const artifacts = r.artifacts || {};
    const base = { workflowRunId: r.id };
    switch (stepName) {
      case 'eventstorm':
        return {
          domainName: r.featureTitle || 'feature',
          problemStatement: r.inputJson?.problemStatement || r.featureTitle || '',
          ...base,
        };
      case 'c4':
        return { eventstormArtifacts: this._getArtifactPath(artifacts, 'eventstorm'), ...base };
      case 'spec':
        return {
          eventstormArtifacts: this._getArtifactPath(artifacts, 'eventstorm'),
          c4Artifacts: this._getArtifactPath(artifacts, 'c4'),
          featureTitle: r.featureTitle,
          ...base,
        };
      case 'plan':
        return {
          specArtifacts: this._getArtifactPath(artifacts, 'spec'),
          featureTitle: r.featureTitle,
          ...base,
        };
      case 'beads':
        return {
          planArtifacts: this._getArtifactPath(artifacts, 'plan'),
          featureTitle: r.featureTitle,
          ...base,
        };
      case 'tdd_red':
        return {
          phase: 'red',
          specArtifacts: this._getArtifactPath(artifacts, 'spec'),
          eventstormArtifacts: this._getArtifactPath(artifacts, 'eventstorm'),
          ...base,
        };
      case 'tdd_green':
        return {
          phase: 'green',
          specArtifacts: this._getArtifactPath(artifacts, 'spec'),
          eventstormArtifacts: this._getArtifactPath(artifacts, 'eventstorm'),
          ...base,
        };
      case 'lint':
      case 'secure':
      case 'doc':
        return {
          eventstormArtifacts: this._getArtifactPath(artifacts, 'eventstorm'),
          c4Artifacts: this._getArtifactPath(artifacts, 'c4'),
          specArtifacts: this._getArtifactPath(artifacts, 'spec'),
          planArtifacts: this._getArtifactPath(artifacts, 'plan'),
          beadsArtifacts: this._getArtifactPath(artifacts, 'beads'),
          ...base,
        };
      default:
        return base;
    }
  }

  _toEnvelope(stepName, result, durationMs) {
    const baseMetrics = { durationMs };
    if (result && typeof result.metrics === 'object' && result.metrics != null) {
      if (result.metrics.charsIn != null) baseMetrics.charsIn = result.metrics.charsIn;
      if (result.metrics.charsOut != null) baseMetrics.charsOut = result.metrics.charsOut;
    }
    if (result && typeof result.status === 'string' && Array.isArray(result.artifacts)) {
      return {
        status: result.status,
        artifacts: result.artifacts || [],
        metrics: { ...baseMetrics, ...(result.metrics || {}) },
        errors: result.errors || [],
        logs: result.logs || [],
      };
    }
    // Eventstorm step returns EventstormResult (no status/artifacts); expose path for downstream steps.
    if (stepName === 'eventstorm') {
      const hasSessionId = result && typeof result.sessionId === 'string' && result.sessionId.trim() !== '';
      if (!hasSessionId) {
        return {
          status: 'failed',
          artifacts: [],
          metrics: { ...baseMetrics },
          errors: ['Eventstorm result missing sessionId'],
          logs: result?.logs || [],
          rawResult: result,
        };
      }
    }
    let artifacts = [];
    if (stepName === 'eventstorm' && result && typeof result.sessionId === 'string') {
      artifacts = [{ type: 'eventstorm', path: `docs/eventstorm/${result.sessionId}/summary.json` }];
    }
    return {
      status: 'ok',
      artifacts,
      metrics: { ...baseMetrics },
      errors: [],
      logs: result?.logs || [],
      rawResult: result,
    };
  }
}

module.exports = { InProcessStepExecutorAdapter };
