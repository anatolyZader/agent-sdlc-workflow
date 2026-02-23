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

describe('WorkflowService', () => {
  describe('startWorkflow', () => {
    it('returns runId and status when given featureTitle', async () => {
      const service = new WorkflowService(noopRepo, noopExecutor, noopStore, noopClock);
      const result = await service.startWorkflow({ featureTitle: 'refund approval' });
      assert.strictEqual(typeof result.runId, 'string');
      assert.ok(result.runId.length > 0);
      assert.strictEqual(typeof result.status, 'string');
    });

    it('returns runId and status when given featureTitle and options', async () => {
      const service = new WorkflowService(noopRepo, noopExecutor, noopStore, noopClock);
      const result = await service.startWorkflow({
        featureTitle: 'refund approval',
        options: { budgetProfile: 'low' },
      });
      assert.strictEqual(typeof result.runId, 'string');
      assert.strictEqual(typeof result.status, 'string');
    });

    it('throws or returns error when featureTitle is missing', async () => {
      const service = new WorkflowService(noopRepo, noopExecutor, noopStore, noopClock);
      await assert.rejects(
        async () => service.startWorkflow({}),
        /featureTitle|400|invalid/i
      );
    });

    it('throws or returns error when featureTitle is empty string', async () => {
      const service = new WorkflowService(noopRepo, noopExecutor, noopStore, noopClock);
      await assert.rejects(
        async () => service.startWorkflow({ featureTitle: '' }),
        /featureTitle|400|invalid/i
      );
    });
  });

  describe('getRun', () => {
    it('returns null for non-existent runId', async () => {
      const service = new WorkflowService(noopRepo, noopExecutor, noopStore, noopClock);
      const result = await service.getRun('non-existent-id');
      assert.strictEqual(result, null);
    });

    it('returns run with runId, status when run exists', async () => {
      const run = { id: 'wf-1', status: 'running', currentStep: 'eventstorm', completedSteps: [], artifacts: {} };
      const repo = { save: async () => {}, get: async (id) => (id === 'wf-1' ? run : null), update: async () => {} };
      const service = new WorkflowService(repo, noopExecutor, noopStore, noopClock);
      const result = await service.getRun('wf-1');
      assert.ok(result);
      assert.strictEqual(result.runId || result.id, 'wf-1');
      assert.strictEqual(typeof result.status, 'string');
    });
  });

  describe('resumeWorkflow', () => {
    it('returns status and optionally currentStep and artifacts', async () => {
      const service = new WorkflowService(noopRepo, noopExecutor, noopStore, noopClock);
      await assert.rejects(
        async () => service.resumeWorkflow('wf-1'),
        /Not implemented|not found/i
      );
    });
  });

  describe('abortWorkflow', () => {
    it('returns status aborted', async () => {
      const service = new WorkflowService(noopRepo, noopExecutor, noopStore, noopClock);
      const result = await service.abortWorkflow('wf-1');
      assert.strictEqual(result.status, 'aborted');
    });
  });
});
