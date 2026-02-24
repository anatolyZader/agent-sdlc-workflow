'use strict';

/**
 * Port: generate implementation plan from spec (e.g. via spec-kit CLI).
 * @interface
 */
function IPlanGenerationPort() {
  if (new.target === IPlanGenerationPort) {
    throw new Error('IPlanGenerationPort is abstract');
  }
}

/**
 * @param {object} inputs - Run context (spec artifacts, featureTitle, workflowRunId)
 * @returns {Promise<{ status: string, artifacts: Array<{ type: string, path?: string, meta?: object }>, metrics: object, errors: string[] }>}
 */
IPlanGenerationPort.prototype.run = function (inputs) {
  throw new Error('run not implemented');
};

module.exports = { IPlanGenerationPort };
