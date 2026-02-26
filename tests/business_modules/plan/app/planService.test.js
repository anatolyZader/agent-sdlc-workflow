'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { PlanService } = require(path.join(__dirname, '../../../../business_modules/plan/app/planService'));

describe('PlanService', () => {
  it('returns envelope with status, artifacts, metrics, errors', async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'plan-svc-'));
    const config = { projectRoot, useSpecKitPackage: false };
    const service = new PlanService(config);

    const result = await service.run({
      specArtifacts: null,
      featureTitle: 'foo',
    });

    assert.ok(['ok', 'failed'].includes(result.status));
    assert.ok(Array.isArray(result.artifacts));
    assert.ok(typeof result.metrics?.durationMs === 'number');
    assert.ok(Array.isArray(result.errors));
  });

  it('returns failed when ensureSpecKitReady throws (useSpecKitPackage true, no .specify)', async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'plan-svc-nospeckit-'));
    const config = { projectRoot, useSpecKitPackage: true, specifyAutoInit: false };
    const service = new PlanService(config);

    const result = await service.run({
      specArtifacts: null,
    });

    assert.strictEqual(result.status, 'failed');
    assert.strictEqual(result.artifacts.length, 0);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('Spec-kit') || result.errors[0].includes('specify'));

    await fs.rm(projectRoot, { recursive: true, force: true });
  });
});
