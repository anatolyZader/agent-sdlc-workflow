'use strict';

const fp = require('fastify-plugin');

module.exports = fp(async function eventstormRouter(fastify, opts) {
  fastify.route({
    method: 'POST',
    url: '/api/eventstorm/run',
    handler: fastify.eventstormRun,
    schema: {
      tags: ['eventstorm'],
      body: {
        type: 'object',
        required: ['domainName', 'problemStatement'],
        properties: {
          domainName: { type: 'string', minLength: 1 },
          problemStatement: { type: 'string', minLength: 1 },
          constraints: { type: 'array', items: { type: 'string' } },
          timeboxMinutes: { type: 'number', minimum: 1 },
          contextSnippets: { type: 'array' },
        },
        additionalProperties: false,
      },
      response: { 200: { type: 'object', additionalProperties: true } },
    },
  });
});
