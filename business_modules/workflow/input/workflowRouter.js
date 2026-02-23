'use strict';

const fp = require('fastify-plugin');

module.exports = fp(async function workflowRouter(fastify, opts) {
  fastify.route({
    method: 'POST',
    url: '/api/workflow/start',
    handler: fastify.workflowStart,
    schema: {
      tags: ['workflow'],
      body: {
        type: 'object',
        required: ['featureTitle'],
        properties: {
          featureTitle: { type: 'string', minLength: 1 },
          options: { type: 'object', properties: { budgetProfile: { type: 'string', enum: ['low', 'medium', 'high'] } } },
        },
        additionalProperties: false,
      },
      response: {
        200: {
          type: 'object',
          properties: { runId: { type: 'string' }, status: { type: 'string' } },
          required: ['runId', 'status'],
          additionalProperties: false,
        },
      },
    },
  });

  fastify.route({
    method: 'POST',
    url: '/api/workflow/resume',
    handler: fastify.workflowResume,
    schema: {
      tags: ['workflow'],
      body: {
        type: 'object',
        required: ['runId'],
        properties: { runId: { type: 'string', minLength: 1 } },
        additionalProperties: false,
      },
      response: { 200: { type: 'object', additionalProperties: true } },
    },
  });

  fastify.route({
    method: 'GET',
    url: '/api/workflow/:id',
    handler: fastify.workflowGet,
    schema: {
      tags: ['workflow'],
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      response: { 200: { type: 'object', additionalProperties: true } },
    },
  });

  fastify.route({
    method: 'POST',
    url: '/api/workflow/abort',
    handler: fastify.workflowAbort,
    schema: {
      tags: ['workflow'],
      body: {
        type: 'object',
        required: ['runId'],
        properties: { runId: { type: 'string', minLength: 1 } },
        additionalProperties: false,
      },
      response: {
        200: {
          type: 'object',
          properties: { status: { type: 'string', const: 'aborted' } },
          required: ['status'],
          additionalProperties: false,
        },
      },
    },
  });
});
