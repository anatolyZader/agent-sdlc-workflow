'use strict';

/**
 * Port: generate SpecMD from domain slice (eventstorm/c4).
 * @interface
 */
function ISpecGenerationPort() {
  if (new.target === ISpecGenerationPort) {
    throw new Error('ISpecGenerationPort is abstract');
  }
}

/**
 * @param {object} inputs - Run context (e.g. workflow run, eventstorm/c4 artifacts)
 * @returns {Promise<{ status: string, artifacts: Array<{ type: string, path?: string, meta?: object }>, metrics: object, errors: string[] }>}
 */
ISpecGenerationPort.prototype.run = function (inputs) {
  throw new Error('run not implemented');
};

module.exports = { ISpecGenerationPort };
