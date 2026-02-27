'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { ClaudeCodeEventstormAdapter } = require(path.join(__dirname, '../../../../../business_modules/eventstorm/infrastructure/adapters/claudeCodeEventstormAdapter'));

const fixtureSummary = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../../../../tests/eventstorm/golden/billing-refunds/fixture.summary.json'), 'utf8')
);
const fixtureBoard = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../../../../tests/eventstorm/golden/billing-refunds/fixture.board.json'), 'utf8')
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

  it('builds EventstormResult from board.json when present and valid (schema + boardValidator)', async () => {
    const projectRoot = path.join(__dirname, '../../../../../');
    const runClaudeAgent = async () => ({ ok: true });
    const readFile = async (filePath) => {
      if (filePath.endsWith('board.json')) return JSON.stringify(fixtureBoard);
      if (filePath.endsWith('summary.json')) return JSON.stringify(fixtureSummary);
      if (filePath.endsWith('06-diagrams.mmd')) return 'flowchart from board';
      if (filePath.endsWith('07-context-map.mmd')) return 'context map from board';
      throw new Error(`Unexpected read: ${filePath}`);
    };
    const adapter = new ClaudeCodeEventstormAdapter({
      config: { projectRoot },
      runClaudeAgent,
      readFile,
    });
    const result = await adapter.runSession({
      sessionId: 'board-session',
      domainName: 'Billing',
      problemStatement: 'Refunds',
    });
    assert.strictEqual(result.sessionId, 'board-session');
    assert.strictEqual(result.ubiquitousLanguage.length, 1);
    assert.strictEqual(result.ubiquitousLanguage[0].term, 'Refund');
    assert.strictEqual(result.domainEvents.length, 2);
    assert.strictEqual(result.domainEvents[0].name, 'RefundRequested');
    assert.strictEqual(result.commands.length, 2);
    assert.strictEqual(result.openQuestions[0], 'Who approves refunds above $500?');
    assert.strictEqual(result.mermaid.eventStorm, 'flowchart from board');
    assert.strictEqual(result.mermaid.contextMap, 'context map from board');
  });

  it('falls back to summary.json when board.json is missing', async () => {
    const projectRoot = path.join(__dirname, '../../../../../');
    const runClaudeAgent = async () => ({ ok: true });
    const readFile = async (filePath) => {
      if (filePath.endsWith('board.json')) throw new Error('ENOENT');
      if (filePath.endsWith('summary.json')) return JSON.stringify(fixtureSummary);
      if (filePath.endsWith('06-diagrams.mmd')) return 'flowchart';
      throw new Error(`Unexpected read: ${filePath}`);
    };
    const adapter = new ClaudeCodeEventstormAdapter({
      config: { projectRoot },
      runClaudeAgent,
      readFile,
    });
    const result = await adapter.runSession({
      sessionId: 'no-board',
      domainName: 'Billing',
      problemStatement: 'Refunds',
    });
    assert.strictEqual(result.sessionId, 'no-board');
    assert.strictEqual(result.domainEvents.length, 2);
    assert.strictEqual(result.domainEvents[0].name, 'RefundRequested');
  });

  it('falls back to summary.json when board.json fails boardValidator', async () => {
    const projectRoot = path.join(__dirname, '../../../../../');
    const invalidBoard = { ...fixtureBoard, commands: [{ name: 'RequestRefund' }] };
    const runClaudeAgent = async () => ({ ok: true });
    const readFile = async (filePath) => {
      if (filePath.endsWith('board.json')) return JSON.stringify(invalidBoard);
      if (filePath.endsWith('summary.json')) return JSON.stringify(fixtureSummary);
      if (filePath.endsWith('06-diagrams.mmd')) return 'flowchart';
      throw new Error(`Unexpected read: ${filePath}`);
    };
    const adapter = new ClaudeCodeEventstormAdapter({
      config: { projectRoot },
      runClaudeAgent,
      readFile,
    });
    const result = await adapter.runSession({
      sessionId: 'invalid-board',
      domainName: 'Billing',
      problemStatement: 'Refunds',
    });
    assert.strictEqual(result.sessionId, 'invalid-board');
    assert.strictEqual(result.domainEvents.length, 2);
  });

  it('throws with errorType schema_invalid when summary.json fails schema validation', async () => {
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
    let err;
    await assert.rejects(
      async () =>
        adapter.runSession({
          sessionId: 'test-session',
          domainName: 'Billing',
          problemStatement: 'Refunds',
        }),
      (e) => {
        err = e;
        return /schema validation failed/.test(e.message);
      }
    );
    assert.strictEqual(err.errorType, 'schema_invalid');
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
