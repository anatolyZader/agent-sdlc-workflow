'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const projectRoot = path.resolve(__dirname, '..', '..', '..');
const { getPlan } = require(path.join(projectRoot, 'src/cross-cut-modules/budget/getPlan'));

describe('cross-cut budget getPlan', () => {
  it('returns plan with default profile medium when no options', async () => {
    const result = await getPlan({});
    assert.strictEqual(result.profile, 'medium');
    assert.strictEqual(result.maxRetries, 2);
    assert.strictEqual(result.tokenLimit, 200000);
    assert.strictEqual(result.qualityFloor, 'pass');
    assert.strictEqual(result.escalationLevel, 0);
  });

  it('returns plan with low profile and lower tokenLimit', async () => {
    const result = await getPlan({ profile: 'low' });
    assert.strictEqual(result.profile, 'low');
    assert.strictEqual(result.tokenLimit, 50000);
  });

  it('returns plan with high profile and higher tokenLimit', async () => {
    const result = await getPlan({ profile: 'high' });
    assert.strictEqual(result.profile, 'high');
    assert.strictEqual(result.tokenLimit, 500000);
  });

  it('uses explicit maxRetries and tokenLimit when provided', async () => {
    const result = await getPlan({ profile: 'low', maxRetries: 1, tokenLimit: 10000 });
    assert.strictEqual(result.maxRetries, 1);
    assert.strictEqual(result.tokenLimit, 10000);
  });
});
