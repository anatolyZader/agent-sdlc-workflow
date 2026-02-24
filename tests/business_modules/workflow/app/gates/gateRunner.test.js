'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { runGate } = require(path.join(__dirname, '../../../../../business_modules/workflow/app/gates/gateRunner'));

describe('gateRunner', () => {
  describe('runGate', () => {
    it('returns passed: false for invalid gate (no type)', async () => {
      const result = await runGate({}, { runId: 'wf-1', stepName: 'eventstorm' });
      assert.strictEqual(result.passed, false);
      assert.ok(result.message);
    });

    it('returns passed: false for unknown gate type', async () => {
      const result = await runGate({ type: 'unknownType' }, { runId: 'wf-1' });
      assert.strictEqual(result.passed, false);
      assert.ok(result.message.includes('Unknown gate type'));
    });

    it('returns passed: boolean for fileExists gate when implemented', async () => {
      const result = await runGate({ type: 'fileExists', params: { path: '/tmp/x' } }, { runId: 'wf-1', path: '/tmp/x' });
      assert.strictEqual(typeof result.passed, 'boolean');
    });

    it('returns passed: boolean for jsonValid gate when implemented', async () => {
      const result = await runGate({ type: 'jsonValid', params: {} }, { runId: 'wf-1', artifacts: [] });
      assert.strictEqual(typeof result.passed, 'boolean');
    });

    it('returns passed: true for requiredKeys when payload has all keys', async () => {
      const result = await runGate(
        { type: 'requiredKeys', params: { keys: ['domainEvents', 'mermaid'] } },
        { jsonPayload: { domainEvents: [], mermaid: 'graph' } }
      );
      assert.strictEqual(result.passed, true);
    });

    it('returns passed: false for requiredKeys when payload missing keys', async () => {
      const result = await runGate(
        { type: 'requiredKeys', params: { keys: ['domainEvents', 'mermaid'] } },
        { jsonPayload: { domainEvents: [] } }
      );
      assert.strictEqual(result.passed, false);
      assert.ok(result.message.includes('domainEvents') === false);
      assert.ok(result.message.includes('mermaid'));
    });
  });
});
