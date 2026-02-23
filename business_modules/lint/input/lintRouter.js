'use strict';

const fp = require('fastify-plugin');

module.exports = fp(async function lintRouter(fastify, opts) {
  fastify.route({
    method: 'POST',
    url: '/api/lint/run',
    handler: fastify.lintRun,
    schema: {
      tags: ['lint'],
      body: { type: 'object', additionalProperties: true },
      response: { 200: { type: 'object', additionalProperties: true } },
    },
  });
});
