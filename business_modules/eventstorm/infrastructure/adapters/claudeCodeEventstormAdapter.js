'use strict';

const { spawn } = require('child_process');
const { IEventstormFacilitationPort } = require('../../domain/ports/IEventstormFacilitationPort');

/**
 * Build a structured EventStorming facilitation prompt for Claude.
 * @param {object} request - EventstormRequest
 * @returns {string}
 */
function buildEventstormPrompt(request) {
  const parts = [
    'You are a Domain-Driven Design expert facilitating a Big Picture EventStorming session.',
    `Domain: ${request.domainName}`,
    `Problem Statement: ${request.problemStatement}`,
  ];

  if (Array.isArray(request.constraints) && request.constraints.length > 0) {
    parts.push(`Constraints:\n${request.constraints.map((c) => `- ${c}`).join('\n')}`);
  }

  if (request.timeboxMinutes) {
    parts.push(`Timebox: ${request.timeboxMinutes} minutes`);
  }

  if (Array.isArray(request.contextSnippets) && request.contextSnippets.length > 0) {
    parts.push(`Context Snippets: ${JSON.stringify(request.contextSnippets, null, 2)}`);
  }

  parts.push(
    '',
    'Produce a complete EventStorming output as a single JSON object with exactly these fields:',
    '{',
    '  "ubiquitousLanguage": [{ "term": "<string>", "definition": "<string>" }],',
    '  "domainEvents": [{ "name": "<string>", "when": "<string>", "data": ["<string>"] }],',
    '  "commands": [{ "name": "<string>", "actor": "<string>" }],',
    '  "policies": [{ "name": "<string>", "trigger": "<string>", "reaction": "<string>" }],',
    '  "aggregates": [{ "name": "<string>", "invariants": ["<string>"], "handles": ["<string>"] }],',
    '  "boundedContexts": [{ "name": "<string>", "core": true, "eventsOwned": ["<string>"] }],',
    '  "openQuestions": ["<string>"],',
    '  "mermaid": { "eventStorm": "<mermaid diagram string>", "contextMap": "<mermaid diagram string>" }',
    '}',
    '',
    'Respond with ONLY the JSON object. No markdown fences, no explanation, no extra text.',
  );

  return parts.join('\n');
}

/**
 * Normalize a raw parsed object into a valid EventstormResult,
 * filling in any missing arrays or fields.
 * @param {object} raw
 * @returns {object} EventstormResult
 */
function normalizeResult(raw) {
  return {
    ubiquitousLanguage: Array.isArray(raw.ubiquitousLanguage) ? raw.ubiquitousLanguage : [],
    domainEvents: Array.isArray(raw.domainEvents) ? raw.domainEvents : [],
    commands: Array.isArray(raw.commands) ? raw.commands : [],
    policies: Array.isArray(raw.policies) ? raw.policies : [],
    aggregates: Array.isArray(raw.aggregates) ? raw.aggregates : [],
    boundedContexts: Array.isArray(raw.boundedContexts) ? raw.boundedContexts : [],
    openQuestions: Array.isArray(raw.openQuestions) ? raw.openQuestions : [],
    mermaid: {
      eventStorm: raw.mermaid?.eventStorm ?? '',
      contextMap: raw.mermaid?.contextMap ?? '',
    },
  };
}

/**
 * Extract the first JSON object from a string (handles extra text or markdown fences).
 * Uses a greedy match intentionally so nested objects (e.g. mermaid: { … }) are captured whole.
 * @param {string} text
 * @returns {object}
 */
function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('No JSON object found in Claude output');
  }
  return JSON.parse(match[0]);
}

/**
 * Invoke the claude CLI in --print mode, piping the prompt via stdin.
 * Env: CLAUDE_CODE_CLI_PATH for an explicit executable path; otherwise uses `claude` on PATH.
 * Uses shell: false to avoid shell-injection risks when the path comes from an env variable.
 * @param {string} prompt
 * @returns {Promise<{ ok: boolean, stdout: string, stderr: string, code: number|null }>}
 */
function runClaudeCode(prompt) {
  return new Promise((resolve) => {
    const cmd = process.env.CLAUDE_CODE_CLI_PATH || 'claude';
    const proc = spawn(cmd, ['--print'], {
      shell: false,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (c) => (stdout += c.toString()));
    proc.stderr?.on('data', (c) => (stderr += c.toString()));

    proc.on('close', (code) => {
      resolve({
        ok: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        code: code ?? null,
      });
    });

    proc.on('error', (err) => {
      resolve({ ok: false, stdout: '', stderr: err.message, code: null });
    });

    if (proc.stdin) {
      proc.stdin.write(prompt, 'utf8');
      proc.stdin.end();
    }
  });
}

/**
 * Claude Code adapter for EventStorming facilitation.
 * Spawns the `claude` CLI (configurable via CLAUDE_CODE_CLI_PATH), sends a structured prompt,
 * and parses the JSON EventstormResult from the output.
 * Implements IEventstormFacilitationPort.
 */
class ClaudeCodeEventstormAdapter extends IEventstormFacilitationPort {
  async runSession(request) {
    const prompt = buildEventstormPrompt(request);
    const result = await runClaudeCode(prompt);

    if (!result.ok) {
      throw new Error(
        `Claude Code facilitation failed (exit ${result.code}): ${result.stderr || result.stdout || 'unknown error'}`
      );
    }

    let parsed;
    try {
      parsed = extractJson(result.stdout);
    } catch (err) {
      throw new Error(`Failed to parse EventstormResult from Claude output: ${err.message}`);
    }

    return normalizeResult(parsed);
  }
}

module.exports = { ClaudeCodeEventstormAdapter, buildEventstormPrompt, normalizeResult, extractJson };
