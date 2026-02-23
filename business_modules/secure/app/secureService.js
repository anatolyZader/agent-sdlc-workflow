'use strict';

class SecureService {
  constructor(secureRunPort) {
    this.secureRunPort = secureRunPort;
  }

  async run(inputs) {
    return this.secureRunPort.run(inputs);
  }
}

module.exports = { SecureService };
