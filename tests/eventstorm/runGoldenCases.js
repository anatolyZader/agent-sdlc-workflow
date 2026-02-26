#!/usr/bin/env node
'use strict';

/**
 * EventStorm golden-case pipeline:
 * 1. Optionally spawn CLI: claude --agent eventstorm-coordinator -p "<prompt>" (when RUN_EVENTSTORM_CLI=1)
 * 2. Validate summary.json with JSON Schema (Ajv)
 * 3. Run structural checks (cross-link, orphans, contradiction gate, coverage)
 *
 * Without RUN_EVENTSTORM_CLI: evaluates fixture.summary.json per case (CI-friendly, no auth).
 * With RUN_EVENTSTORM_CLI=1: runs real agent, then evaluates docs/eventstorm/<sessionId>/summary.json.
 */

const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const { EventstormEvaluator } = require('./eventstormEvaluator.js');

const GOLDEN_DIR = path.join(__dirname, 'golden');
const RUN_CLI = process.env.RUN_EVENTSTORM_CLI === '1' || process.env.RUN_EVENTSTORM_CLI === 'true';
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '../..');

function discoverCases() {
  return fs.readdirSync(GOLDEN_DIR).filter((name) => {
    const dir = path.join(GOLDEN_DIR, name);
    return fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, 'input.json'));
  });
}

function buildPrompt(input, sessionId) {
  const parts = [
    `Session ID: ${sessionId}`,
    `Write all artifacts to docs/eventstorm/${sessionId}/`,
    '',
    '--- Session input ---',
  ];
  if (input.rawText) {
    parts.push(input.rawText);
  } else {
    if (input.domainName) parts.push(`Domain: ${input.domainName}`);
    if (input.problemStatement) parts.push(`Problem statement:\n${input.problemStatement}`);
    if (Array.isArray(input.constraints) && input.constraints.length) {
      parts.push('Constraints:\n' + input.constraints.map((c) => `- ${c}`).join('\n'));
    }
  }
  return 'Run an EventStorm session on the following input.\n\n' + parts.join('\n');
}

function runClaudeAgent(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['--agent', 'eventstorm-coordinator', '-p', prompt], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (c) => { stdout += c; });
    child.stderr?.on('data', (c) => { stderr += c; });
    child.on('error', (e) => reject(e));
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`claude exited ${code}: ${stderr || stdout}`));
      else resolve({ stdout, stderr });
    });
  });
}

function main() {
  const evaluator = new EventstormEvaluator();
  const cases = discoverCases();
  let exitCode = 0;

  for (const caseName of cases) {
    const dir = path.join(GOLDEN_DIR, caseName);
    const inputPath = path.join(dir, 'input.json');
    const assertionsPath = path.join(dir, 'expected.assertions.json');
    const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const assertions = fs.existsSync(assertionsPath)
      ? JSON.parse(fs.readFileSync(assertionsPath, 'utf8'))
      : {};

    let summaryPath;
    if (RUN_CLI) {
      const sessionId = crypto.randomUUID();
      const prompt = buildPrompt(input, sessionId);
      process.stderr.write(`[${caseName}] Running claude --agent eventstorm-coordinator...\n`);
      try {
        runClaudeAgent(prompt);
        summaryPath = path.join(PROJECT_ROOT, 'docs', 'eventstorm', sessionId);
      } catch (e) {
        process.stderr.write(`[${caseName}] CLI failed: ${e.message}\n`);
        exitCode = 1;
        continue;
      }
    } else {
      const fixturePath = path.join(dir, 'fixture.summary.json');
      if (!fs.existsSync(fixturePath)) {
        process.stderr.write(`[${caseName}] No fixture.summary.json; skip (set RUN_EVENTSTORM_CLI=1 to run agent).\n`);
        continue;
      }
      summaryPath = fixturePath;
    }

    const summary = RUN_CLI
      ? evaluator.loadSummary(summaryPath)
      : JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    const result = evaluator.runAll(summary, assertions);

    if (result.passed) {
      process.stdout.write(`[${caseName}] PASS\n`);
    } else {
      process.stderr.write(`[${caseName}] FAIL\n`);
      for (const f of result.failures) process.stderr.write(`  - ${f}\n`);
      exitCode = 1;
    }
  }

  process.exit(exitCode);
}

main();
