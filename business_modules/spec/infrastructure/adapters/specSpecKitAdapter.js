'use strict';

const fs = require('fs').promises;
const path = require('path');
const { ISpecGenerationPort } = require('../../domain/ports/ISpecGenerationPort');
const { produceSpecWithSpecKit } = require('../specKitHelper');

/**
 * Resolve artifact: object use as-is; string try as file path (JSON).
 * @param {object|string|null} artifact
 * @param {string} projectRoot
 * @returns {Promise<object>}
 */
async function resolveArtifact(artifact, projectRoot) {
  if (artifact == null) return {};
  if (typeof artifact === 'object') return artifact;
  const p = String(artifact).trim();
  if (!p) return {};
  try {
    const full = path.isAbsolute(p) ? p : path.join(projectRoot, p);
    const raw = await fs.readFile(full, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Spec generator adapter. Writes .specify/specs/<feature>/spec.md from eventstorm/c4 via spec-kit helper.
 * When config.useSpecKitPackage is true: ensureSpecKitReady and .specify template. Implements ISpecGenerationPort.
 */
class SpecSpecKitAdapter extends ISpecGenerationPort {
  constructor({ config }) {
    super();
    this.config = config;
    this.projectRoot = config?.projectRoot ?? process.cwd();
  }

  async run(inputs) {
    const start = Date.now();
    try {
      const eventstormData = await resolveArtifact(inputs.eventstormArtifacts, this.projectRoot);
      const c4Data = await resolveArtifact(inputs.c4Artifacts, this.projectRoot);
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
}

module.exports = { SpecSpecKitAdapter };
