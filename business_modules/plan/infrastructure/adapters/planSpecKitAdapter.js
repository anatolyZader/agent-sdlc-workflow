'use strict';

const path = require('path');
const fs = require('fs').promises;
const { IPlanGenerationPort } = require('../../domain/ports/IPlanGenerationPort');
const {
  runSpecifyCheck,
  ensureSpecifyInited,
  runSpecifyPlan,
} = require('../../../../cross-cut-modules/specKit/specKitCli');

/**
 * Derive spec slug from spec artifact path (e.g. .../specs/001-feature-name/spec.md -> 001-feature-name).
 * @param {string|object} specArtifacts - path string or { path } or [{ path }]
 * @returns {string|null}
 */
function slugFromSpecArtifacts(specArtifacts) {
  let p = null;
  if (typeof specArtifacts === 'string') p = specArtifacts;
  else if (specArtifacts?.path) p = specArtifacts.path;
  else if (Array.isArray(specArtifacts)?.[0]?.path) p = specArtifacts[0].path;
  if (!p) return null;
  const parts = path.normalize(p).split(path.sep);
  const specsIdx = parts.indexOf('specs');
  if (specsIdx >= 0 && parts[specsIdx + 1]) return parts[specsIdx + 1];
  return null;
}

/**
 * Plan generator adapter. Uses spec-kit CLI (specify check, optional init, specify plan) to produce plan from spec.
 * When config.useSpecKitPackage is true: invokes specify check, optional init, then specify plan.
 * Implements IPlanGenerationPort.
 */
class PlanSpecKitAdapter extends IPlanGenerationPort {
  constructor({ config }) {
    super();
    this.config = config;
    this.projectRoot = config?.projectRoot ?? process.cwd();
  }

  async run(inputs) {
    const start = Date.now();
    try {
      const useSpecKitPackage = this.config?.useSpecKitPackage === true;
      const specifyAutoInit = this.config?.specifyAutoInit === true;
      const slug = slugFromSpecArtifacts(inputs.specArtifacts);

      if (useSpecKitPackage) {
        const checkResult = await runSpecifyCheck(this.projectRoot);
        if (!checkResult.ok) {
          if (specifyAutoInit) {
            const initResult = await ensureSpecifyInited(this.projectRoot);
            if (!initResult.ok) {
              throw new Error(initResult.message || 'specify init failed.');
            }
          } else {
            throw new Error(
              'Spec-kit required for plan step. Install: uv tool install specify-cli --from git+https://github.com/github/spec-kit.git ; then run specify init . ' +
                (checkResult.stderr || checkResult.stdout || '')
            );
          }
        }
      }

      const planResult = await runSpecifyPlan(this.projectRoot, slug || undefined);
      const durationMs = Date.now() - start;

      if (!planResult.ok) {
        return {
          status: 'failed',
          artifacts: [],
          metrics: { durationMs },
          errors: [planResult.stderr || planResult.stdout || 'specify plan failed'],
        };
      }

      const planPath =
        slug != null
          ? path.join(this.projectRoot, '.specify', 'specs', slug, 'plan.md')
          : path.join(this.projectRoot, '.specify', 'plan.md');
      let planExists = false;
      try {
        await fs.access(planPath);
        planExists = true;
      } catch {
        // plan.md may not exist if CLI does not write it yet
      }

      const artifacts = planExists
        ? [{ type: 'plan', path: planPath, meta: { specKit: true } }]
        : [];

      return {
        status: 'ok',
        artifacts,
        metrics: { durationMs },
        errors: [],
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      return {
        status: 'failed',
        artifacts: [],
        metrics: { durationMs },
        errors: [err.message || String(err)],
      };
    }
  }
}

module.exports = { PlanSpecKitAdapter };
