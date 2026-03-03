'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const {
  LangGraphWorkflowAdapter,
  buildStepGraph,
  buildSdlcPipelineGraph,
} = require(path.join(__dirname, '../../../../../business_modules/workflow/infrastructure/adapters/langGraphWorkflowAdapter'));

// Helpers
function makeController(result) {
  return { run: async () => result };
}
function failingController(msg) {
  return {
    run: async () => {
      throw new Error(msg);
    },
  };
}
const noopController = makeController({ status: 'ok', artifacts: [], errors: [], metrics: {} });

function makeControllerDeps(overrides = {}) {
  // Constructor expects named deps: eventstormController, c4Controller, etc.
  const defaults = {
    eventstormController: noopController,
    c4Controller: noopController,
    specController: noopController,
    planController: noopController,
    beadsController: noopController,
    tddController: noopController,
    lintController: noopController,
    secureController: noopController,
    docController: noopController,
  };
  return { ...defaults, ...overrides };
}

// Controllers keyed by step name for buildSdlcPipelineGraph
function makeStepControllers(overrides = {}) {
  const defaults = {
    eventstorm: noopController,
    c4: noopController,
    spec: noopController,
    plan: noopController,
    beads: noopController,
    tdd_red: noopController,
    tdd_green: noopController,
    lint: noopController,
    secure: noopController,
    doc: noopController,
  };
  return { ...defaults, ...overrides };
}

function makeAdapter(overrides = {}, config = {}) {
  return new LangGraphWorkflowAdapter({ ...makeControllerDeps(overrides), config });
}

const defaultPlan = [
  { name: 'eventstorm', mode: 'auto', exitCriteria: [{ type: 'requiredKeys', params: { keys: ['domainEvents'] } }] },
  { name: 'c4', mode: 'auto' },
  { name: 'spec', mode: 'auto' },
];

describe('LangGraphWorkflowAdapter', () => {
  describe('constructor', () => {
    it('can be instantiated with step controllers and config', () => {
      const adapter = makeAdapter();
      assert.ok(adapter instanceof LangGraphWorkflowAdapter);
    });

    it('throws when instantiated directly as IWorkflowStepExecutorPort', () => {
      const { IWorkflowStepExecutorPort } = require(path.join(__dirname, '../../../../../business_modules/workflow/domain/ports/IWorkflowStepExecutorPort'));
      assert.throws(() => new IWorkflowStepExecutorPort(), /abstract/i);
    });
  });

  describe('runStep', () => {
    it('returns ok envelope when controller returns ok result', async () => {
      const adapter = makeAdapter({
        eventstormController: makeController({
          status: 'ok',
          artifacts: [{ type: 'eventstorm', path: '/tmp/es.json' }],
          errors: [],
          metrics: { durationMs: 10 },
        }),
      });
      const run = { id: 'wf-1', featureTitle: 'test', artifacts: {} };
      const result = await adapter.runStep({
        stepName: 'eventstorm',
        inputs: { run, plan: [{ name: 'eventstorm', mode: 'auto' }] },
      });
      assert.strictEqual(result.status, 'ok');
      assert.ok(Array.isArray(result.artifacts));
    });

    it('returns failed envelope when controller throws', async () => {
      const adapter = makeAdapter({ eventstormController: failingController('controller exploded') });
      const run = { id: 'wf-2', featureTitle: 'test', artifacts: {} };
      const result = await adapter.runStep({
        stepName: 'eventstorm',
        inputs: { run, plan: [{ name: 'eventstorm', mode: 'auto' }] },
      });
      assert.strictEqual(result.status, 'failed');
      assert.ok(result.errors.some((e) => e.includes('controller exploded')));
    });

    it('returns failed envelope for unknown step', async () => {
      const adapter = makeAdapter();
      const result = await adapter.runStep({
        stepName: 'unknown_step',
        inputs: { run: { id: 'wf-3', artifacts: {} }, plan: [] },
      });
      assert.strictEqual(result.status, 'failed');
      assert.ok(result.errors.some((e) => e.includes('Unknown step')));
    });

    it('runs gate check as a separate graph node and fails when gate not satisfied', async () => {
      // Controller returns ok but with no domainEvents in raw result — gate should fail
      const adapter = makeAdapter({
        eventstormController: makeController({
          status: 'ok',
          artifacts: [],
          errors: [],
          metrics: {},
          // rawResult will be undefined → requiredKeys gate will fail (no payload)
        }),
      });
      const run = { id: 'wf-4', featureTitle: 'test', artifacts: {} };
      const plan = [
        {
          name: 'eventstorm',
          mode: 'auto',
          exitCriteria: [{ type: 'requiredKeys', params: { keys: ['domainEvents'] } }],
        },
      ];
      const result = await adapter.runStep({ stepName: 'eventstorm', inputs: { run, plan } });
      // Gate checks payload (rawResult is absent) → "No payload to validate"
      assert.strictEqual(result.status, 'failed');
      assert.ok(result.errors.length > 0);
    });

    it('passes gate check when raw result satisfies requiredKeys', async () => {
      const rawResult = { domainEvents: ['OrderPlaced'] };
      const adapter = makeAdapter({
        eventstormController: makeController({
          status: 'ok',
          artifacts: [],
          errors: [],
          metrics: {},
          rawResult,
        }),
      });
      const run = { id: 'wf-5', featureTitle: 'test', artifacts: {} };
      const plan = [
        {
          name: 'eventstorm',
          mode: 'auto',
          exitCriteria: [{ type: 'requiredKeys', params: { keys: ['domainEvents'] } }],
        },
      ];
      const result = await adapter.runStep({ stepName: 'eventstorm', inputs: { run, plan } });
      assert.strictEqual(result.status, 'ok');
    });

    it('respects step timeout and returns failed on timeout', async () => {
      const slowController = {
        run: () => new Promise((resolve) => setTimeout(() => resolve({ status: 'ok', artifacts: [] }), 5000)),
      };
      const adapter = makeAdapter({ eventstormController: slowController }, { stepTimeoutMs: 10 });
      const run = { id: 'wf-6', featureTitle: 'test', artifacts: {} };
      const result = await adapter.runStep({
        stepName: 'eventstorm',
        inputs: { run, plan: [{ name: 'eventstorm', mode: 'auto' }] },
      });
      assert.strictEqual(result.status, 'failed');
      assert.ok(result.errors.some((e) => /timeout/i.test(e)));
    });
  });

  describe('buildPipelineGraph', () => {
    it('returns a compiled LangGraph StateGraph (has an invoke method)', () => {
      const adapter = makeAdapter();
      const graph = adapter.buildPipelineGraph(defaultPlan);
      assert.strictEqual(typeof graph.invoke, 'function');
    });

    it('compiled pipeline graph runs eventstorm → c4 → spec when all steps succeed', async () => {
      const completedSteps = [];
      function trackController(name) {
        return {
          run: async () => {
            completedSteps.push(name);
            return { status: 'ok', artifacts: [], errors: [], metrics: {} };
          },
        };
      }
      const plan = [
        { name: 'eventstorm', mode: 'auto' },
        { name: 'c4', mode: 'auto' },
        { name: 'spec', mode: 'auto' },
      ];
      const adapter = new LangGraphWorkflowAdapter({
        ...makeControllerDeps({
          eventstormController: trackController('eventstorm'),
          c4Controller: trackController('c4'),
          specController: trackController('spec'),
        }),
        config: {},
      });
      const graph = adapter.buildPipelineGraph(plan);
      const finalState = await graph.invoke({
        runId: 'wf-100',
        featureTitle: 'feature',
        currentStep: 'eventstorm',
        completedSteps: [],
        artifacts: {},
        status: 'running',
        planJson: plan,
      });
      assert.strictEqual(finalState.status, 'completed');
      assert.deepStrictEqual(completedSteps, ['eventstorm', 'c4', 'spec']);
    });

    it('pipeline graph halts with status failed when a step fails beyond max retries', async () => {
      const plan = [
        { name: 'eventstorm', mode: 'auto' },
        { name: 'c4', mode: 'auto' },
      ];
      const adapter = new LangGraphWorkflowAdapter({
        ...makeControllerDeps({
          eventstormController: makeController({ status: 'failed', artifacts: [], errors: ['boom'], metrics: {} }),
        }),
        config: { maxStepRetries: 0 },
      });
      const graph = adapter.buildPipelineGraph(plan);
      const finalState = await graph.invoke({
        runId: 'wf-101',
        featureTitle: 'feature',
        currentStep: 'eventstorm',
        completedSteps: [],
        artifacts: {},
        status: 'running',
        planJson: plan,
      });
      assert.strictEqual(finalState.status, 'failed');
      assert.ok(finalState.lastError);
    });

    it('pipeline graph stops at manual checkpoint with waiting_for_red_commit status', async () => {
      const plan = [
        { name: 'spec', mode: 'auto' },
        { name: 'tdd_red', mode: 'manualCheckpoint' },
        { name: 'tdd_green', mode: 'auto' },
      ];
      const adapter = new LangGraphWorkflowAdapter({
        ...makeControllerDeps(),
        config: {},
      });
      const graph = adapter.buildPipelineGraph(plan);
      const finalState = await graph.invoke({
        runId: 'wf-102',
        featureTitle: 'feature',
        currentStep: 'spec',
        completedSteps: [],
        artifacts: {},
        status: 'running',
        planJson: plan,
      });
      assert.strictEqual(finalState.status, 'waiting_for_red_commit');
    });
  });
});

describe('buildStepGraph (unit)', () => {
  it('returns ok result when controller succeeds and no exit criteria', async () => {
    const controller = makeController({ status: 'ok', artifacts: [{ type: 'spec', path: '/tmp/spec.md' }], errors: [], metrics: {} });
    const graph = buildStepGraph(controller, [], 5000);
    const state = await graph.invoke({ stepName: 'spec', run: { id: 'wf-a', artifacts: {} }, plan: [] });
    assert.strictEqual(state.result.status, 'ok');
  });

  it('returns failed result when controller throws', async () => {
    const graph = buildStepGraph(failingController('oops'), [], 5000);
    const state = await graph.invoke({ stepName: 'spec', run: { id: 'wf-b', artifacts: {} }, plan: [] });
    assert.strictEqual(state.result.status, 'failed');
    assert.ok(state.result.errors.some((e) => e.includes('oops')));
  });

  it('evaluates gates and sets gatesPassed=false when gate fails', async () => {
    const controller = makeController({ status: 'ok', artifacts: [], errors: [], metrics: {} });
    const exitCriteria = [{ type: 'requiredKeys', params: { keys: ['missingKey'] } }];
    const graph = buildStepGraph(controller, exitCriteria, 5000);
    const state = await graph.invoke({ stepName: 'eventstorm', run: { id: 'wf-c', artifacts: {} }, plan: [] });
    assert.strictEqual(state.gatesPassed, false);
    assert.strictEqual(state.result.status, 'failed');
  });
});

describe('buildSdlcPipelineGraph (unit)', () => {
  it('returns a compiled graph with an invoke method', () => {
    const plan = [{ name: 'eventstorm', mode: 'auto' }];
    const graph = buildSdlcPipelineGraph(plan, makeStepControllers());
    assert.strictEqual(typeof graph.invoke, 'function');
  });

  it('runs a single-step plan to completion', async () => {
    const plan = [{ name: 'eventstorm', mode: 'auto' }];
    const graph = buildSdlcPipelineGraph(plan, makeStepControllers({ eventstorm: makeController({ status: 'ok', artifacts: [], errors: [], metrics: {} }) }));
    const state = await graph.invoke({
      runId: 'wf-d',
      featureTitle: 'test',
      completedSteps: [],
      artifacts: {},
      status: 'running',
    });
    assert.strictEqual(state.status, 'completed');
    assert.deepStrictEqual(state.completedSteps, ['eventstorm']);
  });
});
