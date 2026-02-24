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
    const request = { body: this._bodyForStep(stepName, run) };
    const start = Date.now();
    try {
      const timeoutMs = this.stepTimeoutMs;
      const result = await Promise.race([
        controller.run(request),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Step timeout')), timeoutMs)
        ),
      ]);
      const durationMs = Date.now() - start;
      return this._toEnvelope(result, durationMs);
    } catch (err) {
      const durationMs = Date.now() - start;
      return {
        status: 'failed',
        artifacts: [],
        metrics: { durationMs },
        errors: [err.message || String(err)],
        logs: [],
      };
    }
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
        return { eventstormArtifacts: artifacts.eventstorm, ...base };
      case 'spec':
        return {
          eventstormArtifacts: artifacts.eventstorm,
          c4Artifacts: artifacts.c4,
          featureTitle: r.featureTitle,
          ...base,
        };
      case 'plan':
        return {
          specArtifacts: artifacts.spec,
          featureTitle: r.featureTitle,
          ...base,
        };
      case 'tdd_red':
        return { phase: 'red', specArtifacts: artifacts.spec, eventstormArtifacts: artifacts.eventstorm, ...base };
      case 'tdd_green':
        return { phase: 'green', specArtifacts: artifacts.spec, eventstormArtifacts: artifacts.eventstorm, ...base };
      case 'lint':
      case 'secure':
      case 'doc':
        return { ...artifacts, ...base };
      default:
        return base;
    }
  }

  _toEnvelope(result, durationMs) {
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
    return {
      status: 'ok',
      artifacts: [],
      metrics: { ...baseMetrics },
      errors: [],
      logs: result?.logs || [],
      rawResult: result,
    };
  }
}

module.exports = { InProcessStepExecutorAdapter };
