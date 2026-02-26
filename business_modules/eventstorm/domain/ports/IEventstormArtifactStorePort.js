'use strict';

function IEventstormArtifactStorePort() {
  if (new.target === IEventstormArtifactStorePort) {
    throw new Error('IEventstormArtifactStorePort is abstract');
  }
}

/**
 * @param {string} sessionId
 * @param {string} relativePath
 * @param {string} content
 * @returns {Promise<void>}
 */
IEventstormArtifactStorePort.prototype.write = function (sessionId, relativePath, content) {
  throw new Error('write not implemented');
};

/**
 * @param {string} sessionId
 * @param {string} relativePath
 * @returns {Promise<string|null>}
 */
IEventstormArtifactStorePort.prototype.read = function (sessionId, relativePath) {
  throw new Error('read not implemented');
};

module.exports = { IEventstormArtifactStorePort };
