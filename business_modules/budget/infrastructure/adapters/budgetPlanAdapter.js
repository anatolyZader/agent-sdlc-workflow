'use strict';

const { IBudgetPlanPort } = require('../../domain/ports/IBudgetPlanPort');

/**
 * Stub budget plan adapter. Implements IBudgetPlanPort.
 * Token/cost policy, quality floors, and escalation are applied when enforced by workflow or step executors.
 */
class BudgetPlanAdapter extends IBudgetPlanPort {
  async plan(inputs) {
    const profile = inputs.profile || 'medium';
    const tokenLimit = inputs.tokenLimit ?? (profile === 'high' ? 500000 : profile === 'low' ? 50000 : 200000);
    return {
      profile,
      maxRetries: inputs.maxRetries ?? 2,
      tokenLimit,
      qualityFloor: inputs.qualityFloor ?? 'pass',
      escalationLevel: inputs.escalationLevel ?? 0,
    };
  }
}

module.exports = { BudgetPlanAdapter };
