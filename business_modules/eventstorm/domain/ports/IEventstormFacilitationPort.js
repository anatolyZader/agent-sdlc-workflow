'use strict';

function IEventstormFacilitationPort() {
  if (new.target === IEventstormFacilitationPort) {
    throw new Error('IEventstormFacilitationPort is abstract');
  }
}

IEventstormFacilitationPort.prototype.runSession = function (request) {
  throw new Error('runSession not implemented');
};

module.exports = { IEventstormFacilitationPort };
