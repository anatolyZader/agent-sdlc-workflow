'use strict';

const fp = require('fastify-plugin');

module.exports = fp(async function secureRouter(fastify, opts) {
  fastify.route({
    method: 'POST',
    url: '/api/secure/run',
    handler: fastify.secureRun,
    schema: {
      tags: ['secure'],
      body: { type: 'object', additionalProperties: true },
      response: { 200: { type: 'object', additionalProperties: true } },
    },
  });
});
