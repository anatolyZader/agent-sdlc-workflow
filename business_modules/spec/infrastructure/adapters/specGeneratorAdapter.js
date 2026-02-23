'use strict';

const { ISpecGenerationPort } = require('../../domain/ports/ISpecGenerationPort');

/**
 * Stub SpecMD generator adapter. Implements ISpecGenerationPort.
 */
class SpecGeneratorAdapter extends ISpecGenerationPort {
  async run() {
    return {
      status: 'ok',
      artifacts: [],
      metrics: { durationMs: 0 },
      errors: [],
    };
  }
}

module.exports = { SpecGeneratorAdapter };
