'use strict';

class EventstormService {
  constructor(eventstormFacilitationPort) {
    this.facilitationPort = eventstormFacilitationPort;
  }

  async runSession(request) {
    return this.facilitationPort.runSession(request);
  }
}

module.exports = { EventstormService };
