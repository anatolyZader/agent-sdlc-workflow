'use strict';

/**
 * Port for running an EventStorm session. Implementations return a single schema-validated EventstormResult.
 * @typedef EventstormResult
 * @property {string} sessionId
 * @property {object[]} ubiquitousLanguage
 * @property {object[]} domainEvents
 * @property {object[]} commands
 * @property {object[]} policies
 * @property {object[]} aggregates
 * @property {object[]} boundedContexts
 * @property {string[]} openQuestions
 * @property {{ eventStorm: string, contextMap?: string }} mermaid
 */

function IEventstormFacilitationPort() {
  if (new.target === IEventstormFacilitationPort) {
    throw new Error('IEventstormFacilitationPort is abstract');
  }
}

/**
 * @param {object} request
 * @returns {Promise<EventstormResult>}
 */
IEventstormFacilitationPort.prototype.runSession = function (request) {
  throw new Error('runSession not implemented');
};

module.exports = { IEventstormFacilitationPort };
