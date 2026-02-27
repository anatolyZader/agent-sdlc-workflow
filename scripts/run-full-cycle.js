#!/usr/bin/env node
'use strict';

/**
 * Run the agent-sdlc-workflow full cycle: start a run, then resume until
 * status is completed, failed, waiting_for_red_commit, or aborted.
 *
 * Prerequisites:
 * - Server running: npm start (default http://127.0.0.1:8787)
 * - If WORKFLOW_TOKEN is set, it is sent as X-Workflow-Token
 *
 * Usage:
 *   node scripts/run-full-cycle.js [featureTitle]
 *   BASE_URL=http://localhost:8787 node scripts/run-full-cycle.js "my feature"
 */

const http = require('node:http');

// #region agent log
function debugLog(location, message, data, hypothesisId) {
  fetch('http://localhost:7342/ingest/a9a09807-76ad-4501-86e6-c73a8c40a8de', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '873b10' }, body: JSON.stringify({ sessionId: '873b10', location, message, data: data || {}, hypothesisId, timestamp: Date.now() }) }).catch(() => {});
}
// #endregion

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8787';
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'waiting_for_red_commit', 'aborted']);
/** Max ms to wait for a single request; aligns with server step timeout so one resume can complete. */
const REQUEST_TIMEOUT_MS = Number(process.env.FULL_CYCLE_REQUEST_TIMEOUT_MS) || 300000;

function request(method, pathname, body, headers = {}) {
  const url = new URL(pathname, baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        headers: { 'Content-Type': 'application/json', ...headers },
      },
      (res) => {
        let data = '';
        res.on('data', (ch) => (data += ch));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: data ? JSON.parse(data) : {} });
          } catch {
            resolve({ statusCode: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms: ${method} ${pathname}`));
    });
    if (body != null && (method === 'POST' || method === 'PUT')) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function getHeaders() {
  const token = process.env.WORKFLOW_TOKEN;
  return token ? { 'X-Workflow-Token': token } : {};
}

async function main() {
  const featureTitle = process.argv[2] || 'full-cycle-test';

  console.log('Full cycle: baseUrl=%s featureTitle=%s', baseUrl, featureTitle);

  const headers = getHeaders();

  // #region agent log
  debugLog('run-full-cycle.js:health-before', 'GET /health', { baseUrl }, 'H3');
  // #endregion
  const health = await request('GET', '/health', null, headers);
  // #region agent log
  debugLog('run-full-cycle.js:health-after', 'health response', { statusCode: health.statusCode }, 'H3');
  // #endregion
  if (health.statusCode !== 200) {
    console.error('Server not ready (GET /health returned %s). Start with: npm start', health.statusCode);
    process.exit(1);
  }

  // #region agent log
  debugLog('run-full-cycle.js:start-before', 'POST /start', { featureTitle }, 'H1');
  // #endregion
  const startRes = await request('POST', '/api/workflow/start', { featureTitle }, headers);
  // #region agent log
  debugLog('run-full-cycle.js:start-after', 'start response', { statusCode: startRes.statusCode, runId: startRes.body?.runId, status: startRes.body?.status }, 'H1');
  // #endregion
  if (startRes.statusCode !== 200) {
    console.error('Start failed:', startRes.statusCode, startRes.body);
    process.exit(1);
  }
  const { runId, status } = startRes.body;
  console.log('Started runId=%s status=%s', runId, status);

  let current = startRes.body;
  let iterations = 0;
  const maxResumes = 100;

  while (current.status === 'running' && iterations < maxResumes) {
    // #region agent log
    const resumeReqAt = Date.now();
    debugLog('run-full-cycle.js:resume-before', 'POST /resume', { iteration: iterations + 1, runId }, 'H1,H2,H5');
    // #endregion
    const progressIntervalMs = 15000;
    const progressTimer = setInterval(() => {
      const elapsed = Math.round((Date.now() - resumeReqAt) / 1000);
      console.log('  Waiting for server... %ds', elapsed);
    }, progressIntervalMs);
    let resumeRes;
    try {
      resumeRes = await request('POST', '/api/workflow/resume', { runId }, headers);
    } finally {
      clearInterval(progressTimer);
    }
    // #region agent log
    debugLog('run-full-cycle.js:resume-after', 'resume response', { iteration: iterations + 1, statusCode: resumeRes.statusCode, status: resumeRes.body?.status, currentStep: resumeRes.body?.currentStep, waitMs: Date.now() - resumeReqAt }, 'H1,H2,H4,H5');
    // #endregion
    if (resumeRes.statusCode !== 200) {
      console.error('Resume failed:', resumeRes.statusCode, resumeRes.body);
      process.exit(1);
    }
    current = resumeRes.body;
    iterations++;
    console.log(
      'Resume #%d -> status=%s currentStep=%s completedSteps=%s',
      iterations,
      current.status,
      current.currentStep ?? '-',
      (current.completedSteps || []).join(', ') || '-'
    );
    if (current.lastError) console.log('  lastError:', current.lastError);
  }

  if (TERMINAL_STATUSES.has(current.status)) {
    console.log('Full cycle ended: status=%s', current.status);
    if (current.artifacts && Object.keys(current.artifacts).length) {
      console.log('Artifacts:', JSON.stringify(current.artifacts, null, 2));
    }
  } else {
    console.log('Stopped after %d resumes; status=%s', maxResumes, current.status);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
