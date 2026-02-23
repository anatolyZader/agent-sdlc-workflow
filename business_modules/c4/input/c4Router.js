'use strict';

const fp = require('fastify-plugin');

module.exports = fp(async function c4Router(fastify, opts) {
  fastify.route({
    method: 'POST',
    url: '/api/c4/run',
    handler: fastify.c4Run,
    schema: {
      tags: ['c4'],
      body: {
        type: 'object',
        properties: {
          workflowRunId: { type: 'string' },
          eventstormArtifacts: { type: 'object' },
        },
        additionalProperties: true,
      },
      response: { 200: { type: 'object', additionalProperties: true } },
    },
  });
});
