'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { WorkflowBeadsAdapter } = require(path.join(__dirname, '../../../../../business_modules/workflow/infrastructure/adapters/workflowBeadsAdapter'));
const { SDLC_RUN_STATE_FILENAME } = require(path.join(__dirname, '../../../../../beadsCli'));

describe('WorkflowBeadsAdapter', () => {
  describe('syncRunState', () => {
    it('writes sdlc-run-state.json under .beads when run is valid and .beads exists', async () => {
      const tmpDir = path.join(os.tmpdir(), `beads-sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.mkdir(path.join(tmpDir, '.beads'), { recursive: true });
      try {
        const adapter = new WorkflowBeadsAdapter({ config: { projectRoot: tmpDir } });
        const run = {
          id: 'wf-123',
          featureTitle: 'Test feature',
          status: 'running',
          currentStep: 'spec',
          completedSteps: ['eventstorm', 'c4'],
          planJson: [{ name: 'eventstorm', mode: 'auto' }, { name: 'c4', mode: 'auto' }, { name: 'spec', mode: 'auto' }],
          updatedAt: new Date('2025-01-15T10:00:00.000Z'),
        };
        await adapter.syncRunState(run);
        const statePath = path.join(tmpDir, '.beads', SDLC_RUN_STATE_FILENAME);
        const raw = await fs.readFile(statePath, 'utf8');
        const state = JSON.parse(raw);
        assert.strictEqual(state.runId, 'wf-123');
        assert.strictEqual(state.featureTitle, 'Test feature');
        assert.strictEqual(state.status, 'running');
        assert.strictEqual(state.currentStep, 'spec');
        assert.deepStrictEqual(state.completedSteps, ['eventstorm', 'c4']);
        assert.deepStrictEqual(state.stepNames, ['eventstorm', 'c4', 'spec']);
        assert.strictEqual(state.updatedAt, '2025-01-15T10:00:00.000Z');
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it('no-ops when run is null or has no id', async () => {
      const tmpDir = path.join(os.tmpdir(), `beads-sync-noop-${Date.now()}`);
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.mkdir(path.join(tmpDir, '.beads'), { recursive: true });
      try {
        const adapter = new WorkflowBeadsAdapter({ config: { projectRoot: tmpDir } });
        await adapter.syncRunState(null);
        await adapter.syncRunState({ featureTitle: 'x' });
        const statePath = path.join(tmpDir, '.beads', SDLC_RUN_STATE_FILENAME);
        await assert.rejects(async () => await fs.access(statePath));
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
