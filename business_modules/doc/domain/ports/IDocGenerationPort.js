'use strict';

function IDocGenerationPort() {
  if (new.target === IDocGenerationPort) {
    throw new Error('IDocGenerationPort is abstract');
  }
}

IDocGenerationPort.prototype.run = function (inputs) {
  throw new Error('run not implemented');
};

module.exports = { IDocGenerationPort };
