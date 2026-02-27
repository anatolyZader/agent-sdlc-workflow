'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { buildDefaultStepPlan } = require(path.join(__dirname, '../../../../business_modules/workflow/app/stepPlanFactory'));

describe('stepPlanFactory', () => {
  describe('buildDefaultStepPlan', () => {
    it('returns steps including plan when config is undefined', () => {
      const plan = buildDefaultStepPlan();
      const names = plan.map((s) => s.name);
      assert.ok(names.includes('plan'));
    });

    it('returns steps including plan when config.planStepEnabled is true', () => {
      const plan = buildDefaultStepPlan({ planStepEnabled: true });
      const names = plan.map((s) => s.name);
      assert.ok(names.includes('plan'));
    });

    it('omits plan step when config.planStepEnabled is false', () => {
      const plan = buildDefaultStepPlan({ planStepEnabled: false });
      const names = plan.map((s) => s.name);
      assert.strictEqual(names.includes('plan'), false);
      assert.ok(names.includes('eventstorm'));
      assert.ok(names.includes('beads'));
    });
  });
});
