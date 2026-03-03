'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { WorkflowBeadsAdapter } = require(path.join(__dirname, '../../../../../business_modules/workflow/infrastructure/adapters/workflowBeadsAdapter'));
const { SDLC_RUN_STATE_FILENAME, parsePlanMarkdown } = require(path.join(__dirname, '../../../../../beadsCli'));

describe('parsePlanMarkdown', () => {
  it('extracts GFM task list items (- [ ] and - [x])', () => {
    const md = '# Plan\n- [ ] Implement domain events\n- [x] Write validation spec\n- [ ] Fix lint errors';
    const tasks = parsePlanMarkdown(md);
    assert.deepStrictEqual(tasks, ['Implement domain events', 'Write validation spec', 'Fix lint errors']);
  });

  it('extracts top-level plain bullet items', () => {
    const md = '# Plan\n- Implement X\n- Write tests\n- Deploy';
    const tasks = parsePlanMarkdown(md);
    assert.deepStrictEqual(tasks, ['Implement X', 'Write tests', 'Deploy']);
  });

  it('handles mixed GFM and plain bullets', () => {
    const md = '- [ ] Task A\n- Task B\n- [x] Task C';
    const tasks = parsePlanMarkdown(md);
    assert.deepStrictEqual(tasks, ['Task A', 'Task B', 'Task C']);
  });

  it('returns empty array for prose-only content', () => {
    const md = '# Plan\n\nThis is just a description with no tasks.';
    const tasks = parsePlanMarkdown(md);
    assert.deepStrictEqual(tasks, []);
  });

  it('handles empty string', () => {
    assert.deepStrictEqual(parsePlanMarkdown(''), []);
  });
});

describe('WorkflowBeadsAdapter', () => {
  describe('run', () => {
    it('creates bd tasks from plan.md and returns ok when mock bd succeeds', async () => {
      const tmpDir = path.join(os.tmpdir(), `beads-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      await fs.mkdir(tmpDir, { recursive: true });
      // Create .beads so bd init is skipped
      await fs.mkdir(path.join(tmpDir, '.beads'), { recursive: true });
      // Write a plan.md with tasks
      const planDir = path.join(tmpDir, 'plan');
      await fs.mkdir(planDir, { recursive: true });
      const planPath = path.join(planDir, 'plan.md');
      await fs.writeFile(planPath, '# Plan\n- [ ] Implement domain events\n- [ ] Write tests\n', 'utf8');
      // Create a mock bd script that always exits 0
      const mockBd = path.join(tmpDir, 'mock-bd.sh');
      await fs.writeFile(mockBd, '#!/bin/sh\nexit 0\n');
      await fs.chmod(mockBd, 0o755);
      const prevBdPath = process.env.BEADS_CLI_PATH;
      process.env.BEADS_CLI_PATH = mockBd;
      try {
        const adapter = new WorkflowBeadsAdapter({ config: { projectRoot: tmpDir } });
        const result = await adapter.run({ planArtifacts: { path: planPath }, featureTitle: 'Test feature' });
        assert.strictEqual(result.status, 'ok');
        assert.ok(Array.isArray(result.artifacts));
        assert.ok(result.artifacts.length > 0);
        assert.strictEqual(result.artifacts[0].type, 'beads');
        assert.deepStrictEqual(result.artifacts[0].meta.tasks, ['Implement domain events', 'Write tests']);
      } finally {
        if (prevBdPath === undefined) delete process.env.BEADS_CLI_PATH;
        else process.env.BEADS_CLI_PATH = prevBdPath;
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it('falls back to feature-level task when no planArtifacts provided', async () => {
      const tmpDir = path.join(os.tmpdir(), `beads-run-fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.mkdir(path.join(tmpDir, '.beads'), { recursive: true });
      const mockBd = path.join(tmpDir, 'mock-bd-fb.sh');
      await fs.writeFile(mockBd, '#!/bin/sh\nexit 0\n');
      await fs.chmod(mockBd, 0o755);
      const prevBdPath = process.env.BEADS_CLI_PATH;
      process.env.BEADS_CLI_PATH = mockBd;
      try {
        const adapter = new WorkflowBeadsAdapter({ config: { projectRoot: tmpDir } });
        const result = await adapter.run({ featureTitle: 'Refund Approval' });
        assert.strictEqual(result.status, 'ok');
        assert.deepStrictEqual(result.artifacts[0].meta.tasks, ['Refund Approval']);
      } finally {
        if (prevBdPath === undefined) delete process.env.BEADS_CLI_PATH;
        else process.env.BEADS_CLI_PATH = prevBdPath;
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it('returns failed when bd init fails', async () => {
      const tmpDir = path.join(os.tmpdir(), `beads-run-fail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      await fs.mkdir(tmpDir, { recursive: true });
      // Do NOT create .beads — forces a bd init call
      const mockBd = path.join(tmpDir, 'mock-bd-fail.sh');
      await fs.writeFile(mockBd, '#!/bin/sh\nexit 1\n');
      await fs.chmod(mockBd, 0o755);
      const prevBdPath = process.env.BEADS_CLI_PATH;
      process.env.BEADS_CLI_PATH = mockBd;
      try {
        const adapter = new WorkflowBeadsAdapter({ config: { projectRoot: tmpDir } });
        const result = await adapter.run({ featureTitle: 'Test' });
        assert.strictEqual(result.status, 'failed');
        assert.ok(result.errors.length > 0);
      } finally {
        if (prevBdPath === undefined) delete process.env.BEADS_CLI_PATH;
        else process.env.BEADS_CLI_PATH = prevBdPath;
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

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
