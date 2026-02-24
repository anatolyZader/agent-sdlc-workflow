'use strict';

/**
 * Builds the default step plan: eventstorm → c4 → spec → plan → tdd_red (manual) → tdd_green → lint → secure → doc.
 * @returns {Array<{ name: string, mode: 'auto'|'manualCheckpoint', inputRefs?: string[], exitCriteria?: object[] }>}
 */
function buildDefaultStepPlan() {
  return [
    {
      name: 'eventstorm',
      mode: 'auto',
      exitCriteria: [{ type: 'requiredKeys', params: { keys: ['domainEvents', 'commands', 'aggregates', 'boundedContexts', 'openQuestions', 'mermaid'] } }],
    },
    { name: 'c4', mode: 'auto' },
    { name: 'spec', mode: 'auto' },
    { name: 'plan', mode: 'auto' },
    { name: 'tdd_red', mode: 'manualCheckpoint' },
    { name: 'tdd_green', mode: 'auto' },
    { name: 'lint', mode: 'auto' },
    { name: 'secure', mode: 'auto' },
    { name: 'doc', mode: 'auto' },
  ];
}

module.exports = { buildDefaultStepPlan };
