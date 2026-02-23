'use strict';

const { IDocGenerationPort } = require('../../domain/ports/IDocGenerationPort');

class DocGeneratorAdapter extends IDocGenerationPort {
  async run() {
    return { status: 'ok', artifacts: [], metrics: { durationMs: 0 }, errors: [] };
  }
}

module.exports = { DocGeneratorAdapter };
