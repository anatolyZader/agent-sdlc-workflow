'use strict';

function IWorkflowBeadsPort() {
  if (new.target === IWorkflowBeadsPort) {
    throw new Error('IWorkflowBeadsPort is abstract');
  }
}

/**
 * Convert the plan artifacts produced by the plan step into a Beads task graph.
 * Parses plan.md and creates a bd task for each item so that agents and humans
 * can use `bd ready` to discover their next coding task.
 * Falls back to a single feature-level task when no plan is readable.
 * @param {object} inputs - { planArtifacts, featureTitle, workflowRunId }
 * @returns {Promise<{ status: string, artifacts: Array, metrics: object, errors: Array }>}
 */
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
