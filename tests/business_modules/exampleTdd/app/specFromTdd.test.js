'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
describe('TDD red (from spec)', () => {
  it('fails until green', () => { assert.strictEqual(1, 0); });
});