'use strict';

/**
 * Builds the default step plan: eventstorm → c4 → spec → [plan] → beads → tdd_red (manual) → tdd_green → lint → secure → doc.
 * When config.planStepEnabled is false, the plan step is omitted.
 * @param {object} [config] - app config; planStepEnabled (default true) controls whether plan step is included
 * @returns {Array<{ name: string, mode: 'auto'|'manualCheckpoint', inputRefs?: string[], exitCriteria?: object[] }>}
 */
function buildDefaultStepPlan(config) {
  const steps = [
    {
      name: 'eventstorm',
      mode: 'auto',
      exitCriteria: [{ type: 'requiredKeys', params: { keys: ['domainEvents', 'commands', 'aggregates', 'boundedContexts', 'openQuestions', 'mermaid'] } }],
    },
    { name: 'c4', mode: 'auto' },
    { name: 'spec', mode: 'auto' },
    { name: 'plan', mode: 'auto' },
    { name: 'beads', mode: 'auto' },
    { name: 'tdd_red', mode: 'manualCheckpoint' },
    { name: 'tdd_green', mode: 'auto' },
    { name: 'lint', mode: 'auto' },
    { name: 'secure', mode: 'auto' },
    { name: 'doc', mode: 'auto' },
  ];
  const planStepEnabled = config?.planStepEnabled !== false;
  if (!planStepEnabled) {
    return steps.filter((s) => s.name !== 'plan');
  }
  return steps;
}

module.exports = { buildDefaultStepPlan };
