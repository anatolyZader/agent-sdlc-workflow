'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { validateBoard } = require(path.join(__dirname, '../../../../business_modules/eventstorm/app/boardValidator'));

function validBoard(overrides = {}) {
  return {
    glossary: [{ term: 'Order', definition: 'Customer purchase request' }],
    commands: [
      { name: 'PlaceOrder', description: 'Create order', actor: 'Customer' },
      { name: 'ApproveOrder', description: 'Approve order', actor: 'TBD' },
    ],
    events: [
      { name: 'OrderPlaced', description: 'Order was placed' },
      { name: 'OrderApproved', description: 'Order was approved' },
    ],
    policies: [
      { trigger: 'OrderPlaced', condition: 'valid', emits: ['OrderApproved'] },
    ],
    aggregates: [
      {
        name: 'Order',
        invariants: ['Amount positive'],
        ownsCommands: ['PlaceOrder', 'ApproveOrder'],
        emitsEvents: ['OrderPlaced', 'OrderApproved'],
      },
    ],
    boundedContexts: [{ name: 'Sales', responsibilities: [], integrations: [] }],
    openQuestions: [],
    version: 1,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('boardValidator', () => {
  describe('validateBoard', () => {
    it('returns valid and no errors for a compliant board', () => {
      const result = validateBoard(validBoard());
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('returns invalid when board is null or not an object', () => {
      assert.deepStrictEqual(validateBoard(null), { valid: false, errors: ['Board is missing or not an object'] });
      assert.deepStrictEqual(validateBoard(undefined), { valid: false, errors: ['Board is missing or not an object'] });
      assert.strictEqual(validateBoard('').valid, false);
      assert.strictEqual(validateBoard(42).valid, false);
    });

    it('accepts empty arrays for optional sections', () => {
      const board = validBoard();
      board.commands = [];
      board.events = [];
      board.policies = [];
      board.aggregates = [];
      const result = validateBoard(board);
      assert.strictEqual(result.valid, true);
    });

    it('reports duplicate command names', () => {
      const board = validBoard();
      board.commands = [
        { name: 'PlaceOrder', actor: 'User' },
        { name: 'PlaceOrder', actor: 'User' },
      ];
      const result = validateBoard(board);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('Duplicate command name') && e.includes('PlaceOrder')));
    });

    it('reports duplicate event names', () => {
      const board = validBoard();
      board.events = [
        { name: 'OrderPlaced' },
        { name: 'OrderPlaced' },
      ];
      const result = validateBoard(board);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('Duplicate event name') && e.includes('OrderPlaced')));
    });

    it('reports duplicate glossary terms', () => {
      const board = validBoard();
      board.glossary = [
        { term: 'Order', definition: 'A' },
        { term: 'Order', definition: 'B' },
      ];
      const result = validateBoard(board);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('Duplicate glossary term') && e.includes('Order')));
    });

    it('reports command missing actor', () => {
      const board = validBoard();
      board.commands = [{ name: 'PlaceOrder' }];
      board.aggregates = [{ name: 'Order', invariants: [], ownsCommands: ['PlaceOrder'], emitsEvents: ['OrderPlaced'] }];
      const result = validateBoard(board);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('no actor') && e.includes('PlaceOrder')));
    });

    it('accepts actor "TBD"', () => {
      const board = validBoard();
      board.commands = [{ name: 'PlaceOrder', actor: 'TBD' }];
      board.aggregates = [{ name: 'Order', invariants: [], ownsCommands: ['PlaceOrder'], emitsEvents: ['OrderPlaced'] }];
      const result = validateBoard(board);
      assert.strictEqual(result.valid, true);
    });

    it('reports command not VerbNoun when name does not match pattern', () => {
      const board = validBoard();
      board.commands = [{ name: 'place_order', actor: 'User' }];
      board.aggregates = [{ name: 'Order', invariants: [], ownsCommands: ['place_order'], emitsEvents: ['OrderPlaced'] }];
      const result = validateBoard(board);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('VerbNoun') && e.includes('place_order')));
    });

    it('reports event not past tense when name does not match heuristic', () => {
      const board = validBoard();
      board.events = [{ name: 'PlaceOrder' }];
      board.aggregates = [{ name: 'Order', invariants: [], ownsCommands: ['PlaceOrder'], emitsEvents: ['PlaceOrder'] }];
      const result = validateBoard(board);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('past tense') && e.includes('PlaceOrder')));
    });

    it('accepts common past tense events', () => {
      const board = validBoard();
      board.events = [{ name: 'OrderCreated' }, { name: 'OrderUpdated' }];
      board.aggregates = [{ name: 'Order', invariants: [], ownsCommands: ['CreateOrder'], emitsEvents: ['OrderCreated', 'OrderUpdated'] }];
      board.commands = [{ name: 'CreateOrder', actor: 'TBD' }];
      board.policies = [];
      const result = validateBoard(board);
      assert.strictEqual(result.valid, true);
    });

    it('reports command with no aggregate owner', () => {
      const board = validBoard();
      board.aggregates = [{ name: 'Order', invariants: [], ownsCommands: ['PlaceOrder'], emitsEvents: ['OrderPlaced'] }];
      board.commands = [
        { name: 'PlaceOrder', actor: 'User' },
        { name: 'CancelOrder', actor: 'User' },
      ];
      const result = validateBoard(board);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('no aggregate owner') && e.includes('CancelOrder')));
    });

    it('reports event not emitted by any aggregate or policy', () => {
      const board = validBoard();
      board.events = [{ name: 'OrderPlaced' }, { name: 'OrderForgotten' }];
      board.aggregates = [{ name: 'Order', invariants: [], ownsCommands: ['PlaceOrder'], emitsEvents: ['OrderPlaced'] }];
      board.policies = [];
      const result = validateBoard(board);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('not emitted by any aggregate or policy') && e.includes('OrderForgotten')));
    });

    it('accepts event emitted only by policy', () => {
      const board = validBoard();
      board.commands = [{ name: 'PlaceOrder', actor: 'User' }];
      board.events = [{ name: 'OrderPlaced' }, { name: 'OrderApproved' }];
      board.aggregates = [{ name: 'Order', invariants: [], ownsCommands: ['PlaceOrder'], emitsEvents: ['OrderPlaced'] }];
      board.policies = [{ trigger: 'OrderPlaced', emits: ['OrderApproved'] }];
      const result = validateBoard(board);
      assert.strictEqual(result.valid, true);
    });

    it('reports policy trigger not referencing existing event or command', () => {
      const board = validBoard();
      board.policies = [{ trigger: 'NonExistentEvent', emits: ['OrderPlaced'] }];
      const result = validateBoard(board);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('Policy trigger') && e.includes('NonExistentEvent')));
    });

    it('skips command/event entries that are null or have non-string name', () => {
      const board = validBoard();
      board.commands = [{ name: 'PlaceOrder', actor: 'User' }, null, { description: 'no name' }];
      const result = validateBoard(board);
      assert.strictEqual(result.valid, true);
    });

    it('handles missing optional top-level arrays safely', () => {
      const board = { glossary: [], commands: [], events: [], policies: [], aggregates: [], boundedContexts: [], openQuestions: [], version: 0, updatedAt: new Date().toISOString() };
      const result = validateBoard(board);
      assert.strictEqual(result.valid, true);
    });

    it('handles non-array commands/events by treating as empty', () => {
      const board = validBoard();
      board.commands = null;
      board.events = undefined;
      board.policies = [];
      const result = validateBoard(board);
      assert.strictEqual(result.valid, true);
    });
  });
});
