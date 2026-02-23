'use strict';

function ISecureRunPort() {
  if (new.target === ISecureRunPort) {
    throw new Error('ISecureRunPort is abstract');
  }
}

ISecureRunPort.prototype.run = function (inputs) {
  throw new Error('run not implemented');
};

module.exports = { ISecureRunPort };
