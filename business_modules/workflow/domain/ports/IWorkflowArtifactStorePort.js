'use strict';

/**
 * Port: store artifacts and return refs.
 * @interface
 */
function IWorkflowArtifactStorePort() {
  if (new.target === IWorkflowArtifactStorePort) {
    throw new Error('IWorkflowArtifactStorePort is abstract');
  }
}

/**
 * @param {object} artifact - { type, content or path, meta }
 * @returns {Promise<string>} ref (path or id)
 */
IWorkflowArtifactStorePort.prototype.store = function (artifact) {
  throw new Error('store not implemented');
};

/**
 * @param {string} ref
 * @returns {Promise<object|null>}
 */
IWorkflowArtifactStorePort.prototype.get = function (ref) {
  throw new Error('get not implemented');
};

module.exports = { IWorkflowArtifactStorePort };
