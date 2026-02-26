'use strict';

function ISpecGenerationPort() {
  if (new.target === ISpecGenerationPort) {
    throw new Error('ISpecGenerationPort is abstract');
  }
}

ISpecGenerationPort.prototype.run = function (inputs) {
  throw new Error('run not implemented');
};

module.exports = { ISpecGenerationPort };
