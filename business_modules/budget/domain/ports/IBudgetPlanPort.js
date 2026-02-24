'use strict';

/**
 * Port: create or resolve a budget plan (profile, max retries, token/cost limits).
 * @interface
 */
function IBudgetPlanPort() {
  if (new.target === IBudgetPlanPort) {
    throw new Error('IBudgetPlanPort is abstract');
  }
}

/**
 * @param {object} inputs - e.g. { profile?: string, maxRetries?: number, tokenLimit?: number }
 * @returns {Promise<{ profile: string, maxRetries?: number, tokenLimit?: number }>}
 */
IBudgetPlanPort.prototype.plan = function (inputs) {
  throw new Error('plan not implemented');
};

module.exports = { IBudgetPlanPort };
