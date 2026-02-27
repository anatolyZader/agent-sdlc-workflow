'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const adapterPath = path.join(__dirname, '..', '..', 'business_modules', 'eventstorm', 'infrastructure', 'adapters', 'claudeCodeEventstormAdapter.js');
const { ClaudeCodeEventstormAdapter } = require(adapterPath);

const fixtureSummary = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'golden', 'billing-refunds', 'fixture.summary.json'), 'utf8')
);

const MINIMAL_DIALOGUE = [
  '# EventStorm session dialogue',
  '',
  '## Bootstrap',
  '',
  '**Coordinator:** Asking context and glossary for initial board.',
  '**Facilitator:** Proposed 2 open questions; glossary patch with 3 terms.',
].join('\n');

describe('session with dialogue', () => {
  it('returns sessionDialoguePath when session-dialogue.md exists (mock)', async () => {
    const projectRoot = path.join(__dirname, '..', '..');
    const sessionId = 'dialogue-session';
    const runClaudeAgent = async () => ({ ok: true });
    const readFile = async (filePath) => {
      if (filePath.endsWith('session-dialogue.md')) return MINIMAL_DIALOGUE;
      if (filePath.endsWith('summary.json')) return JSON.stringify(fixtureSummary);
      if (filePath.endsWith('06-diagrams.mmd')) return 'flowchart';
      throw new Error('Unexpected read: ' + filePath);
    };
    const adapter = new ClaudeCodeEventstormAdapter({
      config: { projectRoot },
      runClaudeAgent,
      readFile,
    });
    const result = await adapter.runSession({
      sessionId,
      domainName: 'Billing',
      problemStatement: 'Refunds',
    });
    assert.strictEqual(result.sessionId, sessionId);
    assert.strictEqual(result.sessionDialoguePath, 'docs/eventstorm/' + sessionId + '/session-dialogue.md');
  });

  it('omits sessionDialoguePath when session-dialogue.md is missing (mock)', async () => {
    const projectRoot = path.join(__dirname, '..', '..');
    const runClaudeAgent = async () => ({ ok: true });
    const readFile = async (filePath) => {
      if (filePath.endsWith('session-dialogue.md')) throw new Error('ENOENT');
      if (filePath.endsWith('summary.json')) return JSON.stringify(fixtureSummary);
      if (filePath.endsWith('06-diagrams.mmd')) return 'flowchart';
      throw new Error('Unexpected read: ' + filePath);
    };
    const adapter = new ClaudeCodeEventstormAdapter({
      config: { projectRoot },
      runClaudeAgent,
      readFile,
    });
    const result = await adapter.runSession({
      sessionId: 'no-dialogue',
      domainName: 'Billing',
      problemStatement: 'Refunds',
    });
    assert.strictEqual(result.sessionId, 'no-dialogue');
    assert.strictEqual(result.sessionDialoguePath, undefined);
  });

  it('live: runs eventstorm with description and asserts dialogue file when RUN_EVENTSTORM_SESSION=1', async () => {
    const runLive = process.env.RUN_EVENTSTORM_SESSION === '1' || process.env.RUN_EVENTSTORM_SESSION === 'true';
    if (!runLive) {
      return;
    }
    const description = process.env.EVENTSTORM_DESCRIPTION || 'Build a refund processing application.';
    const compositionRoot = require(path.join(__dirname, '..', '..', 'src', 'app', 'compositionRoot'));
    const container = compositionRoot.createContainer();
    const eventstormService = container.resolve('eventstormService');

    const result = await eventstormService.runSession({ rawText: description });

    assert.ok(result.sessionId, 'sessionId present');
    const projectRoot = path.join(__dirname, '..', '..');
    const artifactDir = path.join(projectRoot, 'docs', 'eventstorm', result.sessionId);
    assert.ok(fs.existsSync(artifactDir), 'artifact dir exists');

    const dialoguePath = path.join(artifactDir, 'session-dialogue.md');
    assert.ok(fs.existsSync(dialoguePath), 'session-dialogue.md exists');
    assert.strictEqual(result.sessionDialoguePath, 'docs/eventstorm/' + result.sessionId + '/session-dialogue.md');

    const content = fs.readFileSync(dialoguePath, 'utf8');
    assert.ok(content.includes('Coordinator'), 'dialogue contains Coordinator');
    const agentRoles = ['Facilitator', 'Glossary', 'Event modeler', 'Skeptic', 'Aggregate modeler', 'Scenario runner', 'Bounded contexts', 'Decision logger', 'Diagrams', 'Specs', 'QA'];
    const hasRole = agentRoles.some((role) => content.includes(role));
    assert.ok(hasRole, 'dialogue contains at least one agent role');
  });
});
