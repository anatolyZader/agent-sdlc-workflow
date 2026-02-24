'use strict';

const fs = require('fs').promises;
const path = require('path');
const { ISpecGenerationPort } = require('../../domain/ports/ISpecGenerationPort');
const { produceSpecWithSpecKit } = require('../specKitHelper');

/**
 * Spec generator adapter. Writes .specify/specs/<feature>/spec.md from eventstorm/c4.
 * When config.useSpecKitPackage is true: invokes the spec-kit package (specify check, optional init)
 * and uses .specify/templates/spec-template.md. Set USE_SPEC_KIT_PACKAGE=1 and run
 * `uv tool install specify-cli --from git+https://github.com/github/spec-kit.git` and
 * `specify init .` in the project (or SPECIFY_AUTO_INIT=1 to init automatically).
 * Implements ISpecGenerationPort.
 */
class SpecGeneratorAdapter extends ISpecGenerationPort {
  constructor({ config }) {
    super();
    this.projectRoot = config?.projectRoot ?? process.cwd();
  }

  async run(inputs) {
    const start = Date.now();
    try {
      const eventstormData = await this._resolveArtifact(inputs.eventstormArtifacts);
      const c4Data = await this._resolveArtifact(inputs.c4Artifacts);
      const featureTitle = inputs.featureTitle || inputs.run?.featureTitle || 'feature';
      const workflowRunId = inputs.workflowRunId;

      const useSpecKitPackage = this.config?.useSpecKitPackage === true;
      const specifyAutoInit = this.config?.specifyAutoInit === true;
      const { specPath } = await produceSpecWithSpecKit(
        this.projectRoot,
        featureTitle,
        eventstormData,
        c4Data,
        workflowRunId,
        { useSpecKitPackage, autoInit: specifyAutoInit }
      );

      const durationMs = Date.now() - start;
      return {
        status: 'ok',
        artifacts: [{ type: 'spec', path: specPath, meta: { specKit: true } }],
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

  /**
   * Resolve artifact: object use as-is; string try as file path (JSON).
   * @param {object|string|null} artifact
   * @returns {Promise<object>}
   */
  async _resolveArtifact(artifact) {
    if (artifact == null) return {};
    if (typeof artifact === 'object') return artifact;
    const p = String(artifact).trim();
    if (!p) return {};
    try {
      const full = path.isAbsolute(p) ? p : path.join(this.projectRoot, p);
      const raw = await fs.readFile(full, 'utf8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
}

module.exports = { SpecGeneratorAdapter };
