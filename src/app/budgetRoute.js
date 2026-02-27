'use strict';

const fp = require('fastify-plugin');

/** Thin route for POST /api/budget/plan; delegates to cross-cut budget getPlan. */
module.exports = fp(async function budgetRoute(fastify, opts) {
  fastify.route({
    method: 'POST',
    url: '/api/budget/plan',
    handler: fastify.budgetPlan,
    schema: {
      tags: ['budget'],
      body: {
        type: 'object',
        properties: {
          profile: { type: 'string' },
          maxRetries: { type: 'number' },
          tokenLimit: { type: 'number' },
        },
        additionalProperties: true,
      },
      response: { 200: { type: 'object', additionalProperties: true } },
    },
  });
});
