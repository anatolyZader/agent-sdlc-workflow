'use strict';

const fp = require('fastify-plugin');

module.exports = fp(async function docRouter(fastify, opts) {
  fastify.route({
    method: 'POST',
    url: '/api/doc/run',
    handler: fastify.docRun,
    schema: {
      tags: ['doc'],
      body: { type: 'object', additionalProperties: true },
      response: { 200: { type: 'object', additionalProperties: true } },
    },
  });
});
