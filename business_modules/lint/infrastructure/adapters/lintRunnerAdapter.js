'use strict';

const { ILintRunPort } = require('../../domain/ports/ILintRunPort');

class LintRunnerAdapter extends ILintRunPort {
  async run() {
    return { status: 'ok', artifacts: [], metrics: { durationMs: 0 }, errors: [] };
  }
}

module.exports = { LintRunnerAdapter };
