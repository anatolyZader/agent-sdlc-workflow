'use strict';

const fp = require('fastify-plugin');

module.exports = fp(async function tddRouter(fastify, opts) {
  fastify.route({
    method: 'POST',
    url: '/api/tdd/red',
    handler: fastify.tddRunRed,
    schema: {
      tags: ['tdd'],
      body: {
        type: 'object',
        properties: {
          workflowRunId: { type: 'string' },
          specArtifacts: { type: 'object' },
        },
        additionalProperties: true,
      },
      response: { 200: { type: 'object', additionalProperties: true } },
    },
  });

  fastify.route({
    method: 'POST',
    url: '/api/tdd/green',
    handler: fastify.tddRunGreen,
    schema: {
      tags: ['tdd'],
      body: {
        type: 'object',
        properties: {
          workflowRunId: { type: 'string' },
          specArtifacts: { type: 'object' },
        },
        additionalProperties: true,
      },
      response: { 200: { type: 'object', additionalProperties: true } },
    },
  });
});
