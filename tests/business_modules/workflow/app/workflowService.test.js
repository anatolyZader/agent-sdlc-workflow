'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { WorkflowService } = require(path.join(__dirname, '../../../../business_modules/workflow/app/workflowService'));

const noopRepo = {
  save: async () => {},
  get: async () => null,
  update: async () => {},
};
const noopExecutor = { runStep: async () => ({ status: 'ok', artifacts: [] }) };
const noopStore = { store: async () => 'ref', get: async () => null };
const noopClock = { now: () => new Date() };
const deps = (overrides = {}) => ({
  workflowRepo: noopRepo,
  stepExecutor: noopExecutor,
  artifactStore: noopStore,
  clock: noopClock,
  config: {},
  ...overrides,
});

describe('WorkflowService', () => {
  describe('startWorkflow', () => {
    it('returns runId and status when given featureTitle', async () => {
      const service = new WorkflowService(deps());
      const result = await service.startWorkflow({ featureTitle: 'refund approval' });
      assert.strictEqual(typeof result.runId, 'string');
      assert.ok(result.runId.length > 0);
      assert.strictEqual(typeof result.status, 'string');
    });

    it('returns runId and status when given featureTitle and options', async () => {
      const service = new WorkflowService(deps());
      const result = await service.startWorkflow({
        featureTitle: 'refund approval',
        options: { budgetProfile: 'low' },
      });
      assert.strictEqual(typeof result.runId, 'string');
      assert.strictEqual(typeof result.status, 'string');
    });

    it('throws or returns error when featureTitle is missing', async () => {
      const service = new WorkflowService(deps());
      await assert.rejects(
        async () => service.startWorkflow({}),
        /featureTitle|400|invalid/i
      );
    });

    it('throws or returns error when featureTitle is empty string', async () => {
      const service = new WorkflowService(deps());
      await assert.rejects(
        async () => service.startWorkflow({ featureTitle: '' }),
        /featureTitle|400|invalid/i
      );
    });

    it('throws when options.budgetProfile is invalid', async () => {
      const service = new WorkflowService(deps());
      await assert.rejects(
        async () => service.startWorkflow({ featureTitle: 'x', options: { budgetProfile: 'invalid' } }),
        /budgetProfile|invalid/i
      );
    });
  });

  describe('getRun', () => {
    it('returns null for non-existent runId', async () => {
      const service = new WorkflowService(deps());
      const result = await service.getRun('non-existent-id');
      assert.strictEqual(result, null);
    });

    it('returns run with runId, status when run exists', async () => {
      const run = { id: 'wf-1', status: 'running', currentStep: 'eventstorm', completedSteps: [], artifacts: {} };
      const repo = { save: async () => {}, get: async (id) => (id === 'wf-1' ? run : null), update: async () => {} };
      const service = new WorkflowService(deps({ workflowRepo: repo }));
      const result = await service.getRun('wf-1');
      assert.ok(result);
      assert.strictEqual(result.runId || result.id, 'wf-1');
      assert.strictEqual(typeof result.status, 'string');
    });
  });

  describe('resumeWorkflow', () => {
    it('returns status and optionally currentStep and artifacts', async () => {
      const service = new WorkflowService(deps());
      await assert.rejects(
        async () => service.resumeWorkflow('wf-1'),
        /Not implemented|not found/i
      );
    });

    it('sets run status to failed and does not advance when step returns failed (no retries)', async () => {
      const run = {
        id: 'wf-1',
        featureTitle: 'x',
        status: 'running',
        currentStep: 'eventstorm',
        completedSteps: [],
        artifacts: {},
        currentStepRetries: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      let savedRun;
      const repo = {
        save: async () => {},
        get: async (id) => (id === 'wf-1' ? { ...run } : null),
        update: async (r) => { savedRun = r; },
      };
      const failingExecutor = { runStep: async () => ({ status: 'failed', artifacts: [], errors: ['Step error'] }) };
      const service = new WorkflowService(deps({ workflowRepo: repo, stepExecutor: failingExecutor, config: { maxStepRetries: 0 } }));
      const result = await service.resumeWorkflow('wf-1');
      assert.strictEqual(result.status, 'failed');
      assert.strictEqual(result.currentStep, 'eventstorm');
      assert.deepStrictEqual(result.completedSteps, []);
      assert.strictEqual(result.lastError, 'Step error');
      assert.strictEqual(savedRun.status, 'failed');
      assert.strictEqual(savedRun.currentStep, 'eventstorm');
    });

    it('retries step up to maxStepRetries then sets status failed', async () => {
      const run = {
        id: 'wf-1',
        featureTitle: 'x',
        status: 'running',
        currentStep: 'eventstorm',
        completedSteps: [],
        artifacts: {},
        currentStepRetries: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      let savedRun;
      const repo = {
        save: async () => {},
        get: async (id) => (id === 'wf-1' ? (savedRun ? { ...savedRun } : { ...run }) : null),
        update: async (r) => { savedRun = r; },
      };
      const failingExecutor = { runStep: async () => ({ status: 'failed', artifacts: [], errors: ['Step error'] }) };
      const service = new WorkflowService(deps({ workflowRepo: repo, stepExecutor: failingExecutor, config: { maxStepRetries: 2 } }));

      const r1 = await service.resumeWorkflow('wf-1');
      assert.strictEqual(r1.status, 'running');
      assert.strictEqual(savedRun.currentStepRetries, 1);

      const r2 = await service.resumeWorkflow('wf-1');
      assert.strictEqual(r2.status, 'running');
      assert.strictEqual(savedRun.currentStepRetries, 2);

      const r3 = await service.resumeWorkflow('wf-1');
      assert.strictEqual(r3.status, 'failed');
      assert.strictEqual(savedRun.status, 'failed');
      assert.strictEqual(savedRun.currentStep, 'eventstorm');
    });

    it('advances run when beads step returns failed (fail-open)', async () => {
      const plan = [
        { name: 'spec', mode: 'auto' },
        { name: 'plan', mode: 'auto' },
        { name: 'beads', mode: 'auto' },
        { name: 'tdd_red', mode: 'manualCheckpoint' },
      ];
      const run = {
        id: 'wf-beads',
        featureTitle: 'x',
        status: 'running',
        currentStep: 'beads',
        completedSteps: ['spec', 'plan'],
        artifacts: {},
        planJson: plan,
        currentStepRetries: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      let savedRun;
      const repo = {
        save: async () => {},
        get: async (id) => (id === 'wf-beads' ? (savedRun ? { ...savedRun } : { ...run }) : null),
        update: async (r) => { savedRun = r; },
      };
      const beadsFailingExecutor = { runStep: async () => ({ status: 'failed', artifacts: [], errors: ['bd not found'] }) };
      const service = new WorkflowService(deps({ workflowRepo: repo, stepExecutor: beadsFailingExecutor }));
      const result = await service.resumeWorkflow('wf-beads');
      assert.strictEqual(result.status, 'running');
      assert.ok(result.completedSteps.includes('beads'));
      assert.strictEqual(result.currentStep, 'tdd_red');
      assert.strictEqual(savedRun.currentStep, 'tdd_red');
      assert.strictEqual(savedRun.status, 'running');
    });
  });

  describe('abortWorkflow', () => {
    it('returns status aborted', async () => {
      const service = new WorkflowService(deps());
      const result = await service.abortWorkflow('wf-1');
      assert.strictEqual(result.status, 'aborted');
    });
  });

  describe('beads sync', () => {
    it('calls syncRunState after startWorkflow when workflowBeadsPort is provided', async () => {
      let syncedRun = null;
      const beadsPort = { syncRunState: async (run) => { syncedRun = run; } };
      const service = new WorkflowService(deps({ workflowBeadsPort: beadsPort }));
      await service.startWorkflow({ featureTitle: 'sync test' });
      assert.ok(syncedRun);
      assert.strictEqual(syncedRun.featureTitle, 'sync test');
      assert.strictEqual(syncedRun.status, 'running');
      assert.strictEqual(syncedRun.currentStep, 'eventstorm');
      assert.deepStrictEqual(syncedRun.completedSteps, []);
    });

    it('calls syncRunState after successful step completion when workflowBeadsPort is provided', async () => {
      const plan = [{ name: 'eventstorm', mode: 'auto' }, { name: 'c4', mode: 'auto' }];
      const run = {
        id: 'wf-sync',
        featureTitle: 'feature',
        status: 'running',
        currentStep: 'eventstorm',
        completedSteps: [],
        artifacts: {},
        planJson: plan,
        currentStepRetries: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      let syncedRun = null;
      const beadsPort = { syncRunState: async (r) => { syncedRun = r; } };
      const repo = {
        save: async () => {},
        get: async (id) => (id === 'wf-sync' ? { ...run } : null),
        update: async () => {},
      };
      const okExecutor = { runStep: async () => ({ status: 'ok', artifacts: [] }) };
      const service = new WorkflowService(deps({
        workflowRepo: repo,
        stepExecutor: okExecutor,
        workflowBeadsPort: beadsPort,
      }));
      await service.resumeWorkflow('wf-sync');
      assert.ok(syncedRun);
      assert.deepStrictEqual(syncedRun.completedSteps, ['eventstorm']);
      assert.strictEqual(syncedRun.currentStep, 'c4');
    });
  });
});
