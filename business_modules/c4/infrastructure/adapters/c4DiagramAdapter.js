'use strict';

const { IC4DiagramPort } = require('../../domain/ports/IC4DiagramPort');

/**
 * Stub C4 diagram adapter. Implements IC4DiagramPort.
 */
class C4DiagramAdapter extends IC4DiagramPort {
  async run() {
    return {
      status: 'ok',
      artifacts: [],
      metrics: { durationMs: 0 },
      errors: [],
    };
  }
}

module.exports = { C4DiagramAdapter };
