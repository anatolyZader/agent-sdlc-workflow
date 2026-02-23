'use strict';

class DocService {
  constructor(docGenerationPort) {
    this.docGenerationPort = docGenerationPort;
  }

  async run(inputs) {
    return this.docGenerationPort.run(inputs);
  }
}

module.exports = { DocService };
