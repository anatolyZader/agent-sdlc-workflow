'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');
let Fastify;
try {
  Fastify = require('fastify');
} catch (e) {
  Fastify = null;
}

const baseUrl = 'http://127.0.0.1:8788';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(
      {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let data = '';
        res.on('data', (ch) => (data += ch));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body && (method === 'POST' || method === 'PUT')) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('Workflow API', { skip: !Fastify }, () => {
  let server;

  before(async () => {
    const pathModule = require('path');
    const { createContainer } = require(path.join(projectRoot, 'src/app/compositionRoot'));
    const registerRoutes = require(path.join(projectRoot, 'src/app/routes'));
    const container = createContainer();
    const app = Fastify({ logger: false });
    app.decorate('workflowStart', async (req, reply) => {
      const c = container.resolve('workflowController');
      return c.start(req);
    });
    app.decorate('workflowResume', async (req, reply) => {
      const c = container.resolve('workflowController');
      return c.resume(req);
    });
    app.decorate('workflowGet', async (req, reply) => {
      const c = container.resolve('workflowController');
      const result = await c.get(req);
      if (result === null) {
        reply.code(404);
        return { error: 'Not found' };
      }
      return result;
    });
    app.decorate('workflowAbort', async (req, reply) => {
      const c = container.resolve('workflowController');
      return c.abort(req);
    });
    await app.register(registerRoutes, { container });
    await app.register(require(path.join(projectRoot, 'business_modules/workflow/input/workflowRouter')));
    server = await app.listen({ port: 8788, host: '127.0.0.1' });
  });

  after(async () => {
    if (server) await server.close();
  });

  it('POST /api/workflow/start returns runId and status', async () => {
    const { status, body } = await request('POST', '/api/workflow/start', { featureTitle: 'refund approval' });
    assert.strictEqual(status, 200, 'expected 200');
    assert.strictEqual(typeof body.runId, 'string');
    assert.ok(body.runId.length > 0);
    assert.strictEqual(typeof body.status, 'string');
  });

  it('GET /api/workflow/:id returns 404 for unknown runId', async () => {
    const { status } = await request('GET', '/api/workflow/non-existent-id');
    assert.strictEqual(status, 404);
  });

  it('POST /api/workflow/abort returns status aborted', async () => {
    const { status, body } = await request('POST', '/api/workflow/abort', { runId: 'wf-1' });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.status, 'aborted');
  });
});
