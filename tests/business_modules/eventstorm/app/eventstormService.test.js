'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { EventstormService } = require(path.join(__dirname, '../../../../business_modules/eventstorm/app/eventstormService'));

describe('EventstormService', () => {
  describe('runSession', () => {
    it('returns sessionId and outputs from facilitation port', async () => {
      const mockResult = {
        sessionId: 'test-session-123',
        outputs: [
          { sessionId: 'test-session-123', path: '/repo/docs/eventstorm/test-session-123/01-context.md' },
          { sessionId: 'test-session-123', path: '/repo/docs/eventstorm/test-session-123/summary.json' },
        ],
      };
      const port = {
        runSession: async () => mockResult,
      };
      const service = new EventstormService(port);
      const result = await service.runSession({
        domainName: 'Billing',
        problemStatement: 'Customers cannot understand refunds',
      });
      assert.strictEqual(result.sessionId, 'test-session-123');
      assert.ok(Array.isArray(result.outputs));
      assert.strictEqual(result.outputs.length, 2);
      assert.strictEqual(result.outputs[0].path, '/repo/docs/eventstorm/test-session-123/01-context.md');
    });

    it('delegates to facilitation port with request (rawText or domainName+problemStatement)', async () => {
      let receivedRequest;
      const port = {
        runSession: async (req) => {
          receivedRequest = req;
          return { sessionId: 'sid', outputs: [] };
        },
      };
      const service = new EventstormService(port);
      await service.runSession({
        domainName: 'Billing',
        problemStatement: 'Refunds are confusing',
        timeboxMinutes: 30,
      });
      assert.strictEqual(receivedRequest.domainName, 'Billing');
      assert.strictEqual(receivedRequest.problemStatement, 'Refunds are confusing');
      assert.strictEqual(receivedRequest.timeboxMinutes, 30);
    });

    it('propagates error when port throws', async () => {
      const port = {
        runSession: async () => {
          throw new Error('Facilitation failed');
        },
      };
      const service = new EventstormService(port);
      await assert.rejects(
        async () =>
          service.runSession({
            domainName: 'Billing',
            problemStatement: 'x',
          }),
        /Facilitation failed/
      );
    });
  });
});
