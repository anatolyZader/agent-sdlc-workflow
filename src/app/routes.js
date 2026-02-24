'use strict';

const fp = require('fastify-plugin');

/**
 * Register all routes. Health is unauthenticated; API routes use auth when available.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} options
 * @param {object} options.container - Awilix root container
 */
async function registerRoutes(app, options) {
  const { container } = options;

  app.decorate('container', container);

  app.addHook('preHandler', async (request, reply) => {
    const scope = require('./compositionRoot').createRequestScope(container, {
      request,
      reply,
    });
    request.scope = scope;
  });

  // Auth: when WORKFLOW_TOKEN is set, require JWT or X-Workflow-Token on /api/workflow and /api/eventstorm.
  // 401 = missing/invalid token; 403 = valid token but not allowed (add permission checks here when needed).
  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health' || request.url === '/api/health') return;
    if (!request.url.startsWith('/api/')) return;

    const config = container.resolve('config');
    if (!config.workflowToken) return;

    const headerToken = request.headers['x-workflow-token'];
    if (headerToken === config.workflowToken) {
      if (request.headers['x-workflow-scope'] === 'read_only' && request.method === 'POST' && (request.url.includes('/api/workflow/start') || request.url.includes('/api/workflow/abort'))) {
        reply.code(403);
        return reply.send({ error: 'Forbidden' });
      }
      return;
    }

    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        await request.jwtVerify();
        if (request.headers['x-workflow-scope'] === 'read_only' && request.method === 'POST' && (request.url.includes('/api/workflow/start') || request.url.includes('/api/workflow/abort'))) {
          reply.code(403);
          return reply.send({ error: 'Forbidden' });
        }
        return;
      } catch {
        reply.code(401);
        return reply.send({ error: 'Unauthorized' });
      }
    }

    reply.code(401);
    return reply.send({ error: 'Unauthorized' });
  });

  app.get('/health', async () => {
    return { status: 'ok', service: 'agent-sdlc-workflow' };
  });

  app.get('/api/health', async (request, reply) => {
    const log = request.scope?.resolve?.('log');
    if (log) log.info({ correlationId: request.scope?.resolve?.('correlationId') }, 'api health');
    return { status: 'ok', api: true };
  });
}

module.exports = fp(registerRoutes, { name: 'routes' });
