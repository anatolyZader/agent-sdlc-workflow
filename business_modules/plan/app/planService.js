'use strict';

class PlanService {
  constructor(planGenerationPort) {
    this.planGenerationPort = planGenerationPort;
  }

  async run(inputs) {
    return this.planGenerationPort.run(inputs);
  }
}

module.exports = { PlanService };
