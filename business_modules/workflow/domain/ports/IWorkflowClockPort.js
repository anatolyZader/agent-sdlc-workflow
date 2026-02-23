'use strict';

/**
 * Port: provide current time (for idempotency/timeboxing).
 * @interface
 */
function IWorkflowClockPort() {
  if (new.target === IWorkflowClockPort) {
    throw new Error('IWorkflowClockPort is abstract');
  }
}

/**
 * @returns {Date}
 */
IWorkflowClockPort.prototype.now = function () {
  throw new Error('now not implemented');
};

module.exports = { IWorkflowClockPort };
