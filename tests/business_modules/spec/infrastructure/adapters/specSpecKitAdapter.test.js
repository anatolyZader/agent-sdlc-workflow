'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { SpecSpecKitAdapter } = require(path.join(__dirname, '../../../../../business_modules/spec/infrastructure/adapters/specSpecKitAdapter'));

describe('SpecSpecKitAdapter', () => {
  it('returns envelope with spec artifact and writes spec.md', async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-adapt-'));
    const adapter = new SpecSpecKitAdapter({ config: { projectRoot } });
    const result = await adapter.run({
      eventstormArtifacts: { domainEvents: ['OrderPlaced'], commands: [], aggregates: [], boundedContexts: [], openQuestions: [] },
      c4Artifacts: {},
      featureTitle: 'refund approval',
      workflowRunId: 'wf-1',
    });
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.artifacts.length, 1);
    assert.strictEqual(result.artifacts[0].type, 'spec');
    assert.ok(result.artifacts[0].path.endsWith('spec.md'));
    const content = await fs.readFile(result.artifacts[0].path, 'utf8');
    assert.ok(content.includes('OrderPlaced'));
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('returns failed envelope when projectRoot is a file', async () => {
    const tmpFile = path.join(os.tmpdir(), 'spec-adapt-err.tmp');
    await fs.writeFile(tmpFile, '');
    const adapter = new SpecSpecKitAdapter({ config: { projectRoot: tmpFile } });
    const result = await adapter.run({ eventstormArtifacts: {}, featureTitle: 'x' });
    assert.strictEqual(result.status, 'failed');
    assert.strictEqual(result.artifacts.length, 0);
    assert.ok(result.errors.length > 0);
    await fs.unlink(tmpFile).catch(() => {});
  });
});
