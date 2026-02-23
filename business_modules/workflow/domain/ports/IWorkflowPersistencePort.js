'use strict';

/**
 * Port: persist and retrieve workflow run state.
 * @interface
 */
function IWorkflowPersistencePort() {
  if (new.target === IWorkflowPersistencePort) {
    throw new Error('IWorkflowPersistencePort is abstract');
  }
}

/**
 * @param {object} run - WorkflowRun-like object
 * @returns {Promise<void>}
 */
IWorkflowPersistencePort.prototype.save = function (run) {
  throw new Error('save not implemented');
};

/**
 * @param {string} runId
 * @returns {Promise<object|null>}
 */
IWorkflowPersistencePort.prototype.get = function (runId) {
  throw new Error('get not implemented');
};

/**
 * @param {object} run - WorkflowRun-like object
 * @returns {Promise<void>}
 */
IWorkflowPersistencePort.prototype.update = function (run) {
  throw new Error('update not implemented');
};

module.exports = { IWorkflowPersistencePort };
