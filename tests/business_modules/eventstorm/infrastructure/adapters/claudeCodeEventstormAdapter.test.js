'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const {
  ClaudeCodeEventstormAdapter,
  buildEventstormPrompt,
  normalizeResult,
  extractJson,
} = require(path.join(
  __dirname,
  '../../../../../business_modules/eventstorm/infrastructure/adapters/claudeCodeEventstormAdapter'
));

// ---------------------------------------------------------------------------
// Unit tests for helper functions (no CLI required)
// ---------------------------------------------------------------------------

describe('buildEventstormPrompt', () => {
  it('includes domainName and problemStatement', () => {
    const prompt = buildEventstormPrompt({
      domainName: 'Billing',
      problemStatement: 'Customers cannot understand refunds',
    });
    assert.ok(prompt.includes('Billing'));
    assert.ok(prompt.includes('Customers cannot understand refunds'));
  });

  it('includes constraints when provided', () => {
    const prompt = buildEventstormPrompt({
      domainName: 'Billing',
      problemStatement: 'x',
      constraints: ['GDPR compliant', 'no PII storage'],
    });
    assert.ok(prompt.includes('GDPR compliant'));
    assert.ok(prompt.includes('no PII storage'));
  });

  it('includes timeboxMinutes when provided', () => {
    const prompt = buildEventstormPrompt({
      domainName: 'Billing',
      problemStatement: 'x',
      timeboxMinutes: 45,
    });
    assert.ok(prompt.includes('45'));
  });

  it('omits optional fields when not provided', () => {
    const prompt = buildEventstormPrompt({
      domainName: 'Billing',
      problemStatement: 'x',
    });
    assert.ok(!prompt.includes('Constraints'));
    assert.ok(!prompt.includes('Timebox'));
    assert.ok(!prompt.includes('Context Snippets'));
  });

  it('requests JSON-only response with required fields', () => {
    const prompt = buildEventstormPrompt({ domainName: 'D', problemStatement: 'P' });
    assert.ok(prompt.includes('ubiquitousLanguage'));
    assert.ok(prompt.includes('domainEvents'));
    assert.ok(prompt.includes('commands'));
    assert.ok(prompt.includes('policies'));
    assert.ok(prompt.includes('aggregates'));
    assert.ok(prompt.includes('boundedContexts'));
    assert.ok(prompt.includes('openQuestions'));
    assert.ok(prompt.includes('mermaid'));
  });
});

describe('normalizeResult', () => {
  it('returns all required fields for a fully-populated raw result', () => {
    const raw = {
      ubiquitousLanguage: [{ term: 'Charge', definition: 'A billing request' }],
      domainEvents: [{ name: 'ChargeCreated', when: 'on create', data: [] }],
      commands: [{ name: 'CreateCharge', actor: 'User' }],
      policies: [],
      aggregates: [{ name: 'Charge', invariants: [], handles: ['CreateCharge'] }],
      boundedContexts: [{ name: 'Billing', core: true, eventsOwned: ['ChargeCreated'] }],
      openQuestions: ['Who approves refunds?'],
      mermaid: { eventStorm: 'graph LR', contextMap: 'graph TD' },
    };
    const result = normalizeResult(raw);
    assert.deepStrictEqual(result.ubiquitousLanguage, raw.ubiquitousLanguage);
    assert.deepStrictEqual(result.domainEvents, raw.domainEvents);
    assert.deepStrictEqual(result.commands, raw.commands);
    assert.deepStrictEqual(result.policies, raw.policies);
    assert.deepStrictEqual(result.aggregates, raw.aggregates);
    assert.deepStrictEqual(result.boundedContexts, raw.boundedContexts);
    assert.deepStrictEqual(result.openQuestions, raw.openQuestions);
    assert.strictEqual(result.mermaid.eventStorm, 'graph LR');
    assert.strictEqual(result.mermaid.contextMap, 'graph TD');
  });

  it('fills missing arrays with empty arrays', () => {
    const result = normalizeResult({});
    assert.deepStrictEqual(result.ubiquitousLanguage, []);
    assert.deepStrictEqual(result.domainEvents, []);
    assert.deepStrictEqual(result.commands, []);
    assert.deepStrictEqual(result.policies, []);
    assert.deepStrictEqual(result.aggregates, []);
    assert.deepStrictEqual(result.boundedContexts, []);
    assert.deepStrictEqual(result.openQuestions, []);
  });

  it('fills missing mermaid fields with empty strings', () => {
    const result = normalizeResult({ mermaid: {} });
    assert.strictEqual(result.mermaid.eventStorm, '');
    assert.strictEqual(result.mermaid.contextMap, '');
  });

  it('fills missing mermaid with empty strings when mermaid is absent', () => {
    const result = normalizeResult({});
    assert.strictEqual(result.mermaid.eventStorm, '');
    assert.strictEqual(result.mermaid.contextMap, '');
  });
});

describe('extractJson', () => {
  it('parses a bare JSON object', () => {
    const obj = extractJson('{"domainEvents":[],"commands":[]}');
    assert.deepStrictEqual(obj, { domainEvents: [], commands: [] });
  });

  it('extracts JSON from surrounding text', () => {
    const obj = extractJson('Here is the result:\n{"foo":"bar"}\nDone.');
    assert.deepStrictEqual(obj, { foo: 'bar' });
  });

  it('throws when no JSON object is present', () => {
    assert.throws(() => extractJson('no json here'), /No JSON object found/);
  });

  it('throws when JSON is malformed', () => {
    assert.throws(() => extractJson('{bad json}'));
  });
});

// ---------------------------------------------------------------------------
// Integration-style tests using a mock claude CLI script (no real API calls)
// ---------------------------------------------------------------------------

/**
 * Write a mock claude shell script that ignores stdin and echoes the given JSON.
 * @param {string} scriptPath - absolute path to write the script
 * @param {object|null} jsonOutput - object to echo as JSON, or null for no output
 * @param {number} [exitCode=0] - exit code for the script
 */
async function createMockCli(scriptPath, jsonOutput, exitCode = 0) {
  const body =
    jsonOutput !== null
      ? `#!/bin/sh\ncat /dev/stdin > /dev/null\necho '${JSON.stringify(jsonOutput)}'\nexit ${exitCode}`
      : `#!/bin/sh\nexit ${exitCode}`;
  await fs.writeFile(scriptPath, body, { mode: 0o755 });
}

describe('ClaudeCodeEventstormAdapter.runSession', () => {
  let tmpDir;
  let mockCliPath;
  let originalEnv;

  beforeEach(async () => {
    originalEnv = process.env.CLAUDE_CODE_CLI_PATH;
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-adapt-'));
    mockCliPath = path.join(tmpDir, 'claude-mock.sh');
  });

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env.CLAUDE_CODE_CLI_PATH;
    } else {
      process.env.CLAUDE_CODE_CLI_PATH = originalEnv;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns a normalized EventstormResult when CLI outputs valid JSON', async () => {
    const mockResult = {
      ubiquitousLanguage: [{ term: 'Charge', definition: 'A billing request' }],
      domainEvents: [{ name: 'ChargeCreated', when: 'on create', data: [] }],
      commands: [{ name: 'CreateCharge', actor: 'User' }],
      policies: [],
      aggregates: [{ name: 'Charge', invariants: [], handles: ['CreateCharge'] }],
      boundedContexts: [{ name: 'Billing', core: true, eventsOwned: ['ChargeCreated'] }],
      openQuestions: ['Who approves refunds?'],
      mermaid: { eventStorm: 'graph LR', contextMap: 'graph TD' },
    };

    await createMockCli(mockCliPath, mockResult);
    process.env.CLAUDE_CODE_CLI_PATH = mockCliPath;

    const adapter = new ClaudeCodeEventstormAdapter();
    const result = await adapter.runSession({
      domainName: 'Billing',
      problemStatement: 'Customers cannot understand refunds',
    });

    assert.ok(Array.isArray(result.ubiquitousLanguage));
    assert.ok(Array.isArray(result.domainEvents));
    assert.ok(Array.isArray(result.commands));
    assert.ok(Array.isArray(result.policies));
    assert.ok(Array.isArray(result.aggregates));
    assert.ok(Array.isArray(result.boundedContexts));
    assert.ok(Array.isArray(result.openQuestions));
    assert.strictEqual(typeof result.mermaid, 'object');
    assert.ok(result.mermaid.eventStorm !== undefined);
    assert.ok(result.mermaid.contextMap !== undefined);
    assert.strictEqual(result.domainEvents[0].name, 'ChargeCreated');
    assert.strictEqual(result.boundedContexts[0].name, 'Billing');
  });

  it('normalizes missing fields when CLI returns partial JSON', async () => {
    const partial = { domainEvents: [{ name: 'OrderPlaced', when: 'on order', data: [] }] };

    await createMockCli(mockCliPath, partial);
    process.env.CLAUDE_CODE_CLI_PATH = mockCliPath;

    const adapter = new ClaudeCodeEventstormAdapter();
    const result = await adapter.runSession({ domainName: 'Orders', problemStatement: 'x' });

    assert.deepStrictEqual(result.ubiquitousLanguage, []);
    assert.deepStrictEqual(result.commands, []);
    assert.deepStrictEqual(result.policies, []);
    assert.deepStrictEqual(result.aggregates, []);
    assert.deepStrictEqual(result.boundedContexts, []);
    assert.deepStrictEqual(result.openQuestions, []);
    assert.strictEqual(result.mermaid.eventStorm, '');
    assert.strictEqual(result.mermaid.contextMap, '');
    assert.strictEqual(result.domainEvents[0].name, 'OrderPlaced');
  });

  it('throws when CLI exits with non-zero code', async () => {
    await createMockCli(mockCliPath, null, 1);
    process.env.CLAUDE_CODE_CLI_PATH = mockCliPath;

    const adapter = new ClaudeCodeEventstormAdapter();
    await assert.rejects(
      () => adapter.runSession({ domainName: 'X', problemStatement: 'y' }),
      /Claude Code facilitation failed/
    );
  });

  it('throws when CLI outputs non-JSON text', async () => {
    await fs.writeFile(
      mockCliPath,
      '#!/bin/sh\ncat /dev/stdin > /dev/null\necho "Sorry, I cannot help with that."',
      { mode: 0o755 }
    );
    process.env.CLAUDE_CODE_CLI_PATH = mockCliPath;

    const adapter = new ClaudeCodeEventstormAdapter();
    await assert.rejects(
      () => adapter.runSession({ domainName: 'X', problemStatement: 'y' }),
      /Failed to parse EventstormResult/
    );
  });

  it('throws when CLI is not found', async () => {
    process.env.CLAUDE_CODE_CLI_PATH = '/nonexistent/path/to/claude';

    const adapter = new ClaudeCodeEventstormAdapter();
    await assert.rejects(
      () => adapter.runSession({ domainName: 'X', problemStatement: 'y' }),
      /Claude Code facilitation failed/
    );
  });
});
