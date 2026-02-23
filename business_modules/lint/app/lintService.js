'use strict';

class LintService {
  constructor(lintRunPort) {
    this.lintRunPort = lintRunPort;
  }

  async run(inputs) {
    return this.lintRunPort.run(inputs);
  }
}

module.exports = { LintService };
