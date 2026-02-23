'use strict';

const { IWorkflowClockPort } = require('../../domain/ports/IWorkflowClockPort');

/**
 * System clock. Implements IWorkflowClockPort.
 */
class SystemClockAdapter extends IWorkflowClockPort {
  now() {
    return new Date();
  }
}

module.exports = { SystemClockAdapter };
