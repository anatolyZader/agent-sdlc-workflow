'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { EventstormService } = require(path.join(__dirname, '../../../../business_modules/eventstorm/app/eventstormService'));

describe('EventstormService', () => {
  describe('runSession', () => {
    it('returns EventstormResult with ubiquitousLanguage, domainEvents, commands, policies, aggregates, boundedContexts, openQuestions, mermaid', async () => {
      const mockResult = {
        ubiquitousLanguage: [],
        domainEvents: [{ name: 'ChargeCreated', when: 'on create', data: [] }],
        commands: [{ name: 'CreateCharge', actor: 'User' }],
        policies: [],
        aggregates: [{ name: 'Charge', invariants: [], handles: ['CreateCharge'] }],
        boundedContexts: [{ name: 'Billing', core: true, eventsOwned: ['ChargeCreated'] }],
        openQuestions: [],
        mermaid: { eventStorm: '', contextMap: '' },
      };
      const port = {
        runSession: async () => mockResult,
      };
      const service = new EventstormService(port);
      const result = await service.runSession({
        domainName: 'Billing',
        problemStatement: 'Customers cannot understand refunds',
      });
      assert.ok(Array.isArray(result.ubiquitousLanguage));
      assert.ok(Array.isArray(result.domainEvents));
      assert.ok(Array.isArray(result.commands));
      assert.ok(Array.isArray(result.policies));
      assert.ok(Array.isArray(result.aggregates));
      assert.ok(Array.isArray(result.boundedContexts));
      assert.ok(Array.isArray(result.openQuestions));
      assert.ok(result.mermaid && typeof result.mermaid === 'object');
      assert.ok(result.mermaid.eventStorm !== undefined);
      assert.ok(result.mermaid.contextMap !== undefined);
    });

    it('delegates to facilitation port with request', async () => {
      let receivedRequest;
      const port = {
        runSession: async (req) => {
          receivedRequest = req;
          return { ubiquitousLanguage: [], domainEvents: [], commands: [], policies: [], aggregates: [], boundedContexts: [], openQuestions: [], mermaid: { eventStorm: '', contextMap: '' } };
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
