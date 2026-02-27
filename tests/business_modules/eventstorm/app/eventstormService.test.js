'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { EventstormService } = require(path.join(__dirname, '../../../../business_modules/eventstorm/app/eventstormService'));

describe('EventstormService', () => {
  describe('runSession', () => {
    it('returns EventstormResult (sessionId, domainEvents, commands, etc.) from facilitation port', async () => {
      const mockResult = {
        sessionId: 'test-session-123',
        ubiquitousLanguage: [{ term: 'Refund', definition: 'Money returned to customer' }],
        domainEvents: [{ name: 'RefundRequested', description: '' }],
        commands: [{ name: 'RequestRefund' }],
        policies: [],
        aggregates: [{ name: 'RefundCase', invariants: [], ownsCommands: [], emitsEvents: [] }],
        boundedContexts: [{ name: 'Billing', responsibilities: [], integrations: [] }],
        openQuestions: [],
        mermaid: { eventStorm: 'flowchart LR', contextMap: '' },
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
      assert.ok(Array.isArray(result.domainEvents));
      assert.ok(Array.isArray(result.commands));
      assert.ok(Array.isArray(result.aggregates));
      assert.ok(Array.isArray(result.boundedContexts));
      assert.ok(Array.isArray(result.openQuestions));
      assert.ok(result.mermaid && typeof result.mermaid.eventStorm === 'string');
    });

    it('delegates to facilitation port with request (rawText or domainName+problemStatement)', async () => {
      let receivedRequest;
      const port = {
        runSession: async (req) => {
          receivedRequest = req;
          return {
            sessionId: 'sid',
            ubiquitousLanguage: [],
            domainEvents: [],
            commands: [],
            policies: [],
            aggregates: [],
            boundedContexts: [],
            openQuestions: [],
            mermaid: { eventStorm: '', contextMap: '' },
          };
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
