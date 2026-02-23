'use strict';

const fp = require('fastify-plugin');

module.exports = fp(async function specRouter(fastify, opts) {
  fastify.route({
    method: 'POST',
    url: '/api/spec/run',
    handler: fastify.specRun,
    schema: {
      tags: ['spec'],
      body: {
        type: 'object',
        properties: {
          workflowRunId: { type: 'string' },
          eventstormArtifacts: { type: 'object' },
          c4Artifacts: { type: 'object' },
        },
        additionalProperties: true,
      },
      response: { 200: { type: 'object', additionalProperties: true } },
    },
  });
});
