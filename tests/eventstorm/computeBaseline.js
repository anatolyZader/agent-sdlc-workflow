#!/usr/bin/env node
'use strict';

/**
 * Compute hash of .claude/agents/* and optionally update tests/eventstorm/baseline.json.
 * If hash changes in CI, require explicit rebaseline PR.
 * Usage: node tests/eventstorm/computeBaseline.js [--update]
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '..', '..');
const AGENTS_DIR = path.join(PROJECT_ROOT, '.claude', 'agents');
const BASELINE_PATH = path.join(__dirname, 'baseline.json');

function computeAgentsHash() {
  if (!fs.existsSync(AGENTS_DIR)) return null;
  const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md')).sort();
  const h = crypto.createHash('sha256');
  for (const f of files) {
    h.update(fs.readFileSync(path.join(AGENTS_DIR, f), 'utf8'));
  }
  return h.digest('hex');
}

const hash = computeAgentsHash();
const update = process.argv.includes('--update');

if (update) {
  const baseline = {
    description: 'Hash of .claude/agents/*; if this changes, require explicit rebaseline PR.',
    agentsHash: hash,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log('Updated baseline.json with agentsHash:', hash);
} else {
  console.log(hash ?? '(no .claude/agents)');
}
