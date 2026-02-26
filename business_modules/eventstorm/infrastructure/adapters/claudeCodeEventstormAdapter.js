'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const { IEventstormFacilitationPort } = require('../../domain/ports/IEventstormFacilitationPort');

/**
 * Runs the EventStorm stage by invoking Claude Code with the eventstorm-coordinator
 * agent. The coordinator delegates to eventstorm-* subagents via Task(); this adapter
 * does not call any LLM API directly.
 */
class ClaudeCodeEventstormAdapter extends IEventstormFacilitationPort {
  /**
   * @param {object} deps
   * @param {object} deps.config - app config with projectRoot
   * @param {string} [deps.claudeCommand='claude'] - CLI command (path or "claude")
   */
  constructor({ config, claudeCommand = 'claude' }) {
    super();
    this.projectRoot = config?.projectRoot ?? process.cwd();
    this.claudeCommand = claudeCommand;
  }

  /**
   * @param {object} request
   * @param {string} [request.rawText] - full session input (preferred)
   * @param {string} [request.sessionId] - optional; generated if missing
   * @param {string} [request.domainName]
   * @param {string} [request.problemStatement]
   * @param {string[]} [request.constraints]
   * @param {number} [request.timeboxMinutes]
   * @param {unknown[]} [request.contextSnippets]
   * @returns {Promise<{ sessionId: string, outputs: Array<{ sessionId: string, path: string }> }>}
   */
  async runSession(request) {
    const sessionId = request.sessionId ?? crypto.randomUUID();
    const rawText = this._composeRawText(request);
    if (!rawText || !rawText.trim()) {
      throw new Error('eventstorm runSession: rawText or (domainName + problemStatement) is required');
    }

    const artifactDir = `docs/eventstorm/${sessionId}`;
    const prompt = [
      'Run an EventStorm session on the following input.',
      `Session ID: ${sessionId}`,
      `Write all artifacts to ${artifactDir}/ (01-context.md through 08-qa.md and summary.json).`,
      '',
      '--- Session input ---',
      rawText.trim(),
    ].join('\n');

    const result = await this._runClaudeAgent(prompt);
    if (!result.ok) {
      const err = new Error(`Claude Code eventstorm agent failed: ${result.stderr || result.error || 'non-zero exit'}`);
      err.exitCode = result.exitCode;
      err.stdout = result.stdout;
      err.stderr = result.stderr;
      throw err;
    }

    const outputs = [
      '00-plan.md',
      '01-context.md',
      '02-domain-glossary.md',
      '03-events-commands.md',
      '04-aggregates.md',
      '05-bounded-contexts.md',
      '06-diagrams.mmd',
      '07-specs.md',
      '08-qa.md',
      'summary.json',
    ].map((relativePath) => ({
      sessionId,
      path: path.join(this.projectRoot, artifactDir, relativePath),
    }));

    return { sessionId, outputs };
  }

  /**
   * @param {object} request
   * @returns {string}
   */
  _composeRawText(request) {
    if (request.rawText && typeof request.rawText === 'string' && request.rawText.trim()) {
      return request.rawText;
    }
    const parts = [];
    if (request.domainName) parts.push(`Domain: ${request.domainName}`);
    if (request.problemStatement) parts.push(`Problem statement:\n${request.problemStatement}`);
    if (Array.isArray(request.constraints) && request.constraints.length) {
      parts.push('Constraints:\n' + request.constraints.map((c) => `- ${c}`).join('\n'));
    }
    if (request.timeboxMinutes) parts.push(`Timebox: ${request.timeboxMinutes} minutes`);
    if (Array.isArray(request.contextSnippets) && request.contextSnippets.length) {
      parts.push('Context snippets:\n' + request.contextSnippets.map((s) => String(s)).join('\n'));
    }
    return parts.join('\n\n');
  }

  /**
   * @param {string} prompt
   * @returns {Promise<{ ok: boolean, exitCode?: number, stdout?: string, stderr?: string, error?: string }>}
   */
  _runClaudeAgent(prompt) {
    return new Promise((resolve) => {
      const args = ['--agent', 'eventstorm-coordinator', '-p', prompt];
      const child = spawn(this.claudeCommand, args, {
        cwd: this.projectRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });

      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk) => { stdout += chunk; });
      child.stderr?.on('data', (chunk) => { stderr += chunk; });

      child.on('error', (err) => {
        resolve({ ok: false, error: err.message, stdout, stderr });
      });

      child.on('close', (exitCode) => {
        resolve({
          ok: exitCode === 0,
          exitCode: exitCode ?? undefined,
          stdout: stdout.trim() || undefined,
          stderr: stderr.trim() || undefined,
        });
      });
    });
  }
}

module.exports = { ClaudeCodeEventstormAdapter };
