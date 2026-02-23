'use strict';

const { IWorkflowStepExecutorPort } = require('../../domain/ports/IWorkflowStepExecutorPort');

/**
 * Executes steps via HTTP (e.g. POST /api/eventstorm/run). Implements IWorkflowStepExecutorPort.
 * Stub: returns failed status until wired to real endpoints.
 */
class HttpStepExecutorAdapter extends IWorkflowStepExecutorPort {
  /**
   * @param {{ baseUrl?: string }} options
   */
  constructor(options = {}) {
    super();
    this.baseUrl = options.baseUrl || 'http://127.0.0.1:8787';
  }

  async runStep(params) {
    return {
      status: 'failed',
      artifacts: [],
      errors: ['Step executor not wired'],
    };
  }
}

module.exports = { HttpStepExecutorAdapter };
