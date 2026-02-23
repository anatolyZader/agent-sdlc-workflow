'use strict';

class C4Service {
  constructor(c4DiagramPort) {
    this.c4DiagramPort = c4DiagramPort;
  }

  async run(inputs) {
    return this.c4DiagramPort.run(inputs);
  }
}

module.exports = { C4Service };
