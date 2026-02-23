'use strict';

const Fastify = require('fastify');
const path = require('path');
const { createContainer } = require('./compositionRoot');
const registerRoutes = require('./routes');

const projectRoot = path.resolve(__dirname, '..', '..');

async function main() {
  const container = createContainer();
  const config = container.resolve('config');

  const app = Fastify({ logger: true });

  await app.register(require('@fastify/jwt'), { secret: config.jwtSecret });

  app.decorate('workflowStart', async (request, reply) => {
    try {
      const c = container.resolve('workflowController');
      const result = await c.start(request);
      return result;
    } catch (err) {
      if (/invalid or missing featureTitle/i.test(err.message)) {
        reply.code(400);
        return { error: err.message };
      }
      throw err;
    }
  });
  app.decorate('workflowResume', async (request, reply) => {
    try {
      const c = container.resolve('workflowController');
      return await c.resume(request);
    } catch (err) {
      if (/run not found/i.test(err.message)) {
        reply.code(404);
        return { error: err.message };
      }
      throw err;
    }
  });
  app.decorate('workflowGet', async (request, reply) => {
    const c = container.resolve('workflowController');
    const result = await c.get(request);
    if (result === null) {
      reply.code(404);
      return { error: 'Not found' };
    }
    return result;
  });
  app.decorate('workflowAbort', async (request, reply) => {
    try {
      const c = container.resolve('workflowController');
      return await c.abort(request);
    } catch (err) {
      if (/run not found/i.test(err.message)) {
        reply.code(404);
        return { error: err.message };
      }
      throw err;
    }
  });

  app.decorate('eventstormRun', async (request, reply) => {
    const c = container.resolve('eventstormController');
    return c.run(request);
  });

  await app.register(registerRoutes, { container });
  await app.register(require(path.join(projectRoot, 'business_modules/workflow/input/workflowRouter')));
  await app.register(require(path.join(projectRoot, 'business_modules/eventstorm/input/eventstormRouter')));

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
