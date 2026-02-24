'use strict';

class BudgetController {
  constructor({ budgetService }) {
    this.budgetService = budgetService;
  }

  async plan(request) {
    const body = request.body || {};
    return this.budgetService.plan({
      profile: body.profile,
      maxRetries: body.maxRetries,
      tokenLimit: body.tokenLimit,
      ...body,
    });
  }
}

module.exports = { BudgetController };
