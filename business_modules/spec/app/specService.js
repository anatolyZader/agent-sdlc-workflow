'use strict';

class SpecService {
  constructor(specGenerationPort) {
    this.specGenerationPort = specGenerationPort;
  }

  async run(inputs) {
    return this.specGenerationPort.run(inputs);
  }
}

module.exports = { SpecService };
