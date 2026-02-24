'use strict';

const fp = require('fastify-plugin');

module.exports = fp(async function budgetRouter(fastify, opts) {
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
