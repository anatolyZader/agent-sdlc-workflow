'use strict';

function ILintRunPort() {
  if (new.target === ILintRunPort) {
    throw new Error('ILintRunPort is abstract');
  }
}

ILintRunPort.prototype.run = function (inputs) {
  throw new Error('run not implemented');
};

module.exports = { ILintRunPort };
