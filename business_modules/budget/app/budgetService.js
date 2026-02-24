'use strict';

class BudgetService {
  constructor({ budgetPlanPort }) {
    this.budgetPlanPort = budgetPlanPort;
  }

  async plan(inputs) {
    return this.budgetPlanPort.plan(inputs);
  }
}

module.exports = { BudgetService };
