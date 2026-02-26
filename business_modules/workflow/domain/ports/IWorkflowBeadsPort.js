'use strict';

function IWorkflowBeadsPort() {
  if (new.target === IWorkflowBeadsPort) {
    throw new Error('IWorkflowBeadsPort is abstract');
  }
}

IWorkflowBeadsPort.prototype.run = function (inputs) {
  throw new Error('run not implemented');
};

/**
 * Sync workflow run state into beads so development stays aware of pipeline state.
 * Called after every run update (start, step completion, failure, manual checkpoint).
 * @param {object} run - Workflow run: id, featureTitle, status, currentStep, completedSteps, planJson, updatedAt
 * @returns {Promise<void>} Resolves when sync is done; implementer may no-op or write state file / update bd tasks.
 */
IWorkflowBeadsPort.prototype.syncRunState = async function (run) {
  throw new Error('syncRunState not implemented');
};

module.exports = { IWorkflowBeadsPort };
