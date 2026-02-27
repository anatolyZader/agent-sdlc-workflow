'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { ClaudeCodeEventstormAdapter } = require(path.join(__dirname, '../../../../../business_modules/eventstorm/infrastructure/adapters/claudeCodeEventstormAdapter'));

const fixtureSummary = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../../../../tests/eventstorm/golden/billing-refunds/fixture.summary.json'), 'utf8')
);

describe('ClaudeCodeEventstormAdapter', () => {
  it('returns EventstormResult with required keys when Claude succeeds and summary.json is valid', async () => {
    const projectRoot = path.join(__dirname, '../../../../../');
    const runClaudeAgent = async () => ({ ok: true });
    const readFile = async (filePath) => {
      if (filePath.endsWith('summary.json')) {
        return JSON.stringify(fixtureSummary);
      }
      if (filePath.endsWith('06-diagrams.mmd')) {
        return 'flowchart LR\n  A --> B';
      }
      throw new Error(`Unexpected read: ${filePath}`);
    };
    const adapter = new ClaudeCodeEventstormAdapter({
      config: { projectRoot },
      runClaudeAgent,
      readFile,
    });
    const result = await adapter.runSession({
      sessionId: 'test-session',
      domainName: 'Billing',
      problemStatement: 'Refunds',
    });
    assert.strictEqual(result.sessionId, 'test-session');
    assert.ok(Array.isArray(result.ubiquitousLanguage));
    assert.ok(Array.isArray(result.domainEvents));
    assert.ok(Array.isArray(result.commands));
    assert.ok(Array.isArray(result.policies));
    assert.ok(Array.isArray(result.aggregates));
    assert.ok(Array.isArray(result.boundedContexts));
    assert.ok(Array.isArray(result.openQuestions));
    assert.ok(result.mermaid && typeof result.mermaid.eventStorm === 'string');
    assert.strictEqual(result.domainEvents.length, 2);
    assert.strictEqual(result.mermaid.eventStorm, 'flowchart LR\n  A --> B');
  });

  it('throws when summary.json fails schema validation', async () => {
    const projectRoot = path.join(__dirname, '../../../../../tests/eventstorm/golden/billing-refunds');
    const runClaudeAgent = async () => ({ ok: true });
    const invalidSummary = { ...fixtureSummary, commands: 'not-an-array' };
    const readFile = async (filePath) => {
      if (filePath.endsWith('summary.json')) return JSON.stringify(invalidSummary);
      throw new Error('Unexpected read');
    };
    const adapter = new ClaudeCodeEventstormAdapter({
      config: { projectRoot },
      runClaudeAgent,
      readFile,
    });
    await assert.rejects(
      async () =>
        adapter.runSession({
          sessionId: 'test-session',
          domainName: 'Billing',
          problemStatement: 'Refunds',
        }),
      /schema validation failed/
    );
  });

  it('throws when Claude agent run fails', async () => {
    const adapter = new ClaudeCodeEventstormAdapter({
      config: { projectRoot: process.cwd() },
      runClaudeAgent: async () => ({ ok: false, stderr: 'Agent error' }),
    });
    await assert.rejects(
      async () =>
        adapter.runSession({
          domainName: 'Billing',
          problemStatement: 'Refunds',
        }),
      /eventstorm agent failed|Agent error/
    );
  });
});
