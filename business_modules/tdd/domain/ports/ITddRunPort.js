'use strict';

function ITddRunPort() {
  if (new.target === ITddRunPort) {
    throw new Error('ITddRunPort is abstract');
  }
}

ITddRunPort.prototype.runRed = function (inputs) {
  throw new Error('runRed not implemented');
};

ITddRunPort.prototype.runGreen = function (inputs) {
  throw new Error('runGreen not implemented');
};

module.exports = { ITddRunPort };
