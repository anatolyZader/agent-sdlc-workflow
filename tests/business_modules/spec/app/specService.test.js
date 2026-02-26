'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { SpecService } = require(path.join(__dirname, '../../../../business_modules/spec/app/specService'));

describe('SpecService', () => {
  it('delegates to specGenerationPort.run with inputs', async () => {
    const inputs = { eventstormArtifacts: {}, featureTitle: 'foo' };
    const expected = { status: 'ok', artifacts: [{ type: 'spec', path: '/x/spec.md' }], metrics: {}, errors: [] };
    const port = { run: async (i) => (assert.deepStrictEqual(i, inputs), expected) };
    const service = new SpecService(port);
    const result = await service.run(inputs);
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.artifacts[0].path, '/x/spec.md');
  });

  it('propagates port errors', async () => {
    const port = { run: async () => { throw new Error('spec failed'); } };
    const service = new SpecService(port);
    await assert.rejects(() => service.run({}), { message: 'spec failed' });
  });
});
