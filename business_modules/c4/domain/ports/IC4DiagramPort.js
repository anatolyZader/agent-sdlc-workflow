'use strict';

/**
 * Port: produce C4 L1/L2/L3 diagrams and dependency rules from eventstorm/output.
 * @interface
 */
function IC4DiagramPort() {
  if (new.target === IC4DiagramPort) {
    throw new Error('IC4DiagramPort is abstract');
  }
}

/**
 * @param {object} inputs - Run context (e.g. workflow run, eventstorm artifacts)
 * @returns {Promise<{ status: string, artifacts: Array<{ type: string, path?: string, meta?: object }>, metrics: object, errors: string[] }>}
 */
IC4DiagramPort.prototype.run = function (inputs) {
  throw new Error('run not implemented');
};

module.exports = { IC4DiagramPort };
