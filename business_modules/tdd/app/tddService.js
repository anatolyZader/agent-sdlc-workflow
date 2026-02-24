'use strict';

class TddService {
  constructor({ tddRunPort }) { this.tddRunPort = tddRunPort; }
  async run(inputs) { return this.tddRunPort.run(inputs); }
}
module.exports = { TddService };
