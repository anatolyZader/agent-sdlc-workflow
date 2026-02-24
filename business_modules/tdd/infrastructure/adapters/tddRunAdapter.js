'use strict';

const { ITddRunPort } = require('../../domain/ports/ITddRunPort');

class TddRunAdapter extends ITddRunPort {
  async run() {
    return {
      status: 'ok',
      artifacts: [],
      metrics: { durationMs: 0 },
      errors: [],
    };
  }
}

module.exports = { TddRunAdapter };
