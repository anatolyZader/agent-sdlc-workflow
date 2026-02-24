'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { PlanService } = require(path.join(__dirname, '../../../../business_modules/plan/app/planService'));

describe('PlanService', () => {
  describe('run', () => {
    it('delegates to planGenerationPort.run with inputs', async () => {
      const inputs = { specArtifacts: { path: '/p/.specify/specs/001-foo/spec.md' }, featureTitle: 'Foo' };
      const expected = { status: 'ok', artifacts: [], metrics: {}, errors: [] };
      const port = { run: async (i) => (assert.deepStrictEqual(i, inputs), expected) };
      const service = new PlanService(port);
      const result = await service.run(inputs);
      assert.strictEqual(result.status, 'ok');
      assert.strictEqual(result.artifacts.length, 0);
    });

    it('propagates port errors', async () => {
      const port = { run: async () => { throw new Error('plan failed'); } };
      const service = new PlanService(port);
      await assert.rejects(() => service.run({}), { message: 'plan failed' });
    });
  });
});
