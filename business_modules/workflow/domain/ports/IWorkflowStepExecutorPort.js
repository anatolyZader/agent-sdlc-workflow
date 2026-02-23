'use strict';

/**
 * Port: execute a workflow step and return structured result.
 * @interface
 */
function IWorkflowStepExecutorPort() {
  if (new.target === IWorkflowStepExecutorPort) {
    throw new Error('IWorkflowStepExecutorPort is abstract');
  }
}

/**
 * @param {{ stepName: string, workflowRunId: string, inputs: object }} params
 * @returns {Promise<{ status: string, artifacts: Array<{ type: string, path: string, meta?: object }>, logs?: string[], metrics?: { durationMs: number } }>}
 */
IWorkflowStepExecutorPort.prototype.runStep = function (params) {
  throw new Error('runStep not implemented');
};

module.exports = { IWorkflowStepExecutorPort };
