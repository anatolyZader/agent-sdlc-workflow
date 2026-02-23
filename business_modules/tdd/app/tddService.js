'use strict';

class TddService {
  constructor(tddRunPort) {
    this.tddRunPort = tddRunPort;
  }

  async runRed(inputs) {
    return this.tddRunPort.runRed(inputs);
  }

  async runGreen(inputs) {
    return this.tddRunPort.runGreen(inputs);
  }
}

module.exports = { TddService };
