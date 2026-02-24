'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { SpecGeneratorAdapter } = require(path.join(__dirname, '../../../../business_modules/spec/infrastructure/adapters/specGeneratorAdapter'));

describe('SpecGeneratorAdapter (spec-kit as helper)', () => {
  it('returns envelope with spec artifact and writes .specify/specs/<feature>/spec.md', async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-adapter-'));
    const config = { projectRoot };
    const adapter = new SpecGeneratorAdapter({ config });

    const eventstorm = {
      domainEvents: ['OrderPlaced', 'PaymentReceived'],
      commands: ['PlaceOrder'],
      aggregates: ['Order'],
      boundedContexts: ['Sales'],
      openQuestions: [],
    };
    const result = await adapter.run({
      eventstormArtifacts: eventstorm,
      c4Artifacts: {},
      featureTitle: 'refund approval',
      workflowRunId: 'wf-1',
    });

    assert.strictEqual(result.status, 'ok');
    assert.ok(Array.isArray(result.artifacts));
    assert.strictEqual(result.artifacts.length, 1);
    assert.strictEqual(result.artifacts[0].type, 'spec');
    assert.ok(result.artifacts[0].path);
    assert.ok(result.artifacts[0].path.endsWith('spec.md'));
    assert.strictEqual(result.artifacts[0].meta?.specKit, true);
    assert.ok(typeof result.metrics?.durationMs === 'number');
    assert.deepStrictEqual(result.errors, []);

    const content = await fs.readFile(result.artifacts[0].path, 'utf8');
    assert.ok(content.includes('## Domain (from EventStorming)'));
    assert.ok(content.includes('OrderPlaced'));
    assert.ok(content.includes('PlaceOrder'));
    assert.ok(content.includes('Order'));
    assert.ok(content.includes('Sales'));

    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('handles missing eventstorm and returns ok with empty sections', async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-adapter-2-'));
    const config = { projectRoot };
    const adapter = new SpecGeneratorAdapter({ config });

    const result = await adapter.run({
      eventstormArtifacts: null,
      c4Artifacts: null,
      featureTitle: 'my feature',
      workflowRunId: 'wf-2',
    });

    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.artifacts.length, 1);
    assert.strictEqual(result.artifacts[0].type, 'spec');

    const content = await fs.readFile(result.artifacts[0].path, 'utf8');
    assert.ok(content.includes('Feature specification'));
    assert.ok(content.includes('(none)'));

    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('returns failed envelope when write fails (projectRoot is a file)', async () => {
    const tmpFile = path.join(os.tmpdir(), `spec-adapter-err-${Date.now()}.tmp`);
    await fs.writeFile(tmpFile, '');
    const config = { projectRoot: tmpFile };
    const adapter = new SpecGeneratorAdapter({ config });

    const result = await adapter.run({
      eventstormArtifacts: {},
      featureTitle: 'x',
    });

    assert.strictEqual(result.status, 'failed');
    assert.strictEqual(result.artifacts.length, 0);
    assert.ok(result.errors.length > 0);
    await fs.unlink(tmpFile).catch(() => {});
  });
});
