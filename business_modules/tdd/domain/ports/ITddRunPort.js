'use strict';

function ITddRunPort() {
  if (new.target === ITddRunPort) throw new Error('ITddRunPort is abstract');
}
ITddRunPort.prototype.run = function (inputs) { throw new Error('run not implemented'); };
module.exports = { ITddRunPort };
