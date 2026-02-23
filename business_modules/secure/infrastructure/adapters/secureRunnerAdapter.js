'use strict';

const { ISecureRunPort } = require('../../domain/ports/ISecureRunPort');

class SecureRunnerAdapter extends ISecureRunPort {
  async run() {
    return { status: 'ok', artifacts: [], metrics: { durationMs: 0 }, errors: [] };
  }
}

module.exports = { SecureRunnerAdapter };
