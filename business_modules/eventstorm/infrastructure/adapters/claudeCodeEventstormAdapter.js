'use strict';

const fs = require('node:fs').promises;
const { spawn } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const Ajv = require('ajv').default;
const { IEventstormFacilitationPort } = require('../../domain/ports/IEventstormFacilitationPort');

/**
 * Runs the EventStorm stage by invoking Claude Code with the eventstorm-coordinator
 * agent. The coordinator delegates to eventstorm-* subagents via Task(); this adapter
 * does not call any LLM API directly. Returns a single schema-validated EventstormResult.
 */
class ClaudeCodeEventstormAdapter extends IEventstormFacilitationPort {
  /**
   * @param {object} deps
   * @param {object} deps.config - app config with projectRoot
   * @param {string} [deps.claudeCommand='claude'] - CLI command (path or "claude")
   * @param {Function} [deps.writeFile] - optional; if provided used for writing input.txt, else fs.writeFile
   */
  constructor({ config, claudeCommand = 'claude', runClaudeAgent, readFile, writeFile }) {
    super();
    this.projectRoot = config?.projectRoot ?? process.cwd();
    this.claudeCommand = claudeCommand;
    this._runClaudeAgentInject = runClaudeAgent;
    this._readFileInject = readFile;
    this._writeFileInject = writeFile;
    const schemaPath = path.join(__dirname, '..', 'summarySchema.json');
    this._schema = JSON.parse(require('node:fs').readFileSync(schemaPath, 'utf8'));
    this._validate = new Ajv({ strict: false }).compile(this._schema);
    const boardSchemaPath = path.join(__dirname, '..', 'boardSchema.json');
    this._boardSchema = JSON.parse(require('node:fs').readFileSync(boardSchemaPath, 'utf8'));
    this._validateBoard = new Ajv({ strict: false }).compile(this._boardSchema);
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
   * @returns {Promise<{ sessionId: string, ubiquitousLanguage: object[], domainEvents: object[], commands: object[], policies: object[], aggregates: object[], boundedContexts: object[], openQuestions: string[], mermaid: { eventStorm: string, contextMap?: string } }>}
   */
  async runSession(request) {
    const sessionId = request.sessionId ?? crypto.randomUUID();
    const rawText = this._composeRawText(request);
    if (!rawText || !rawText.trim()) {
      throw new Error('eventstorm runSession: rawText or (domainName + problemStatement) is required');
    }

    const artifactDir = `docs/eventstorm/${sessionId}`;
    const artifactPath = path.join(this.projectRoot, artifactDir);
    await fs.mkdir(artifactPath, { recursive: true });
    const writeFileFn = this._writeFileInject ?? fs.writeFile.bind(fs);
    await writeFileFn(path.join(artifactPath, 'input.txt'), rawText.trim(), 'utf8').catch(() => {});
    const prompt = [
      'Run an EventStorm session on the following input.',
      `Session ID: ${sessionId}`,
      `Write all artifacts to ${artifactDir}/ (01-context.md through 08-qa.md and summary.json).`,
      '',
      '--- Session input ---',
      rawText.trim(),
    ].join('\n');

    const result = this._runClaudeAgentInject
      ? await this._runClaudeAgentInject(prompt)
      : await this._runClaudeAgent(prompt, request.signal);
    if (!result.ok) {
      const reason = result.stderr || result.error || 'non-zero exit';
      const stderrSnippet =
        result.stderr && reason !== result.stderr ? ` stderr: ${String(result.stderr).slice(0, 500)}` : '';
      const err = new Error(`Claude Code eventstorm agent failed: ${reason}${stderrSnippet}`);
      err.exitCode = result.exitCode;
      err.stdout = result.stdout;
      err.stderr = result.stderr;
      err.errorType = 'cli_exit';
      throw err;
    }

    const readFileFn = this._readFileInject || fs.readFile.bind(fs);
    const boardPath = path.join(artifactPath, 'board.json');
    let source;
    try {
      const rawBoard = JSON.parse(await readFileFn(boardPath, 'utf8'));
      if (this._validateBoard(rawBoard)) {
        const { validateBoard } = require('../../app/boardValidator');
        const validation = validateBoard(rawBoard);
        if (validation.valid) {
          source = rawBoard;
        }
      }
    } catch {
      // board.json missing or invalid; fall back to summary.json
    }

    if (!source) {
      const summaryPath = path.join(artifactPath, 'summary.json');
      let rawSummary;
      try {
        rawSummary = JSON.parse(await readFileFn(summaryPath, 'utf8'));
      } catch (e) {
        const err = new Error(`eventstorm: failed to read or parse summary.json: ${e.message}`);
        err.errorType = 'io_missing';
        throw err;
      }
      const valid = this._validate(rawSummary);
      if (!valid) {
        const errors = (this._validate.errors || []).map((e) => `${e.instancePath} ${e.message}`).join('; ');
        const err = new Error(`eventstorm: summary.json schema validation failed: ${errors}`);
        err.errorType = 'schema_invalid';
        throw err;
      }
      source = rawSummary;
    }

    let mermaidEventStorm = '';
    let mermaidContextMap = '';
    try {
      const diagramsPath = path.join(artifactPath, '06-diagrams.mmd');
      mermaidEventStorm = await readFileFn(diagramsPath, 'utf8');
    } catch {
      // 06-diagrams.mmd optional
    }
    try {
      const contextMapPath = path.join(artifactPath, '07-context-map.mmd');
      mermaidContextMap = await readFileFn(contextMapPath, 'utf8');
    } catch {
      // 07-context-map.mmd optional
    }

    const eventstormResult = {
      sessionId,
      ubiquitousLanguage: source.glossary || [],
      domainEvents: source.events || [],
      commands: source.commands || [],
      policies: source.policies || [],
      aggregates: source.aggregates || [],
      boundedContexts: source.boundedContexts || [],
      openQuestions: source.openQuestions || [],
      mermaid: { eventStorm: mermaidEventStorm, contextMap: mermaidContextMap },
    };

    return eventstormResult;
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
   * @param {AbortSignal} [signal] - when aborted, kills the child process and rejects with Step timeout
   * @returns {Promise<{ ok: boolean, exitCode?: number, stdout?: string, stderr?: string, error?: string }>}
   */
  _runClaudeAgent(prompt, signal) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn) => {
        if (!settled) {
          settled = true;
          fn();
        }
      };
      const args = ['--agent', 'eventstorm-coordinator', '-p', prompt];
      const child = spawn(this.claudeCommand, args, {
        cwd: this.projectRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });

      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
      child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8'); });

      const onAbort = () => {
        try {
          child.kill('SIGTERM');
        } catch (_) {}
        const t = setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch (_) {}
        }, 5000);
        child.once('close', () => clearTimeout(t));
        const timeoutErr = new Error('Step timeout');
        timeoutErr.errorType = 'timeout';
        if (signal) signal.removeEventListener('abort', onAbort);
        finish(() => reject(timeoutErr));
      };
      if (signal) signal.addEventListener('abort', onAbort);

      child.on('error', (err) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        finish(() => resolve({ ok: false, error: err.message, stdout, stderr }));
      });

      child.on('close', (exitCode) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        finish(() =>
          resolve({
            ok: exitCode === 0,
            exitCode: exitCode ?? undefined,
            stdout: stdout.trim() || undefined,
            stderr: stderr.trim() || undefined,
          })
        );
      });
    });
  }
}

module.exports = { ClaudeCodeEventstormAdapter };
