'use strict';

/**
 * Port for reading/writing eventstorm session artifacts (e.g. markdown, summary).
 * Reserved for future use; no adapter implements this port yet. The Claude Code adapter
 * currently writes to docs/eventstorm/<sessionId>/ via the CLI and reads summary.json directly.
 */
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
