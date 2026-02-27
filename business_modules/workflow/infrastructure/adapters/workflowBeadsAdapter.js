'use strict';

const { IWorkflowBeadsPort } = require('../../domain/ports/IWorkflowBeadsPort');
const { runBdInit, runBdReady, isBeadsInited, writeSdlcRunState, writeReadyJson } = require('../../../../beadsCli');

class WorkflowBeadsAdapter extends IWorkflowBeadsPort {
  constructor({ config }) {
    super();
    this.config = config;
    this.projectRoot = config?.projectRoot ?? process.cwd();
  }

  async run(inputs) {
    const start = Date.now();
    try {
      const inited = await isBeadsInited(this.projectRoot);
      if (!inited) {
        const initResult = await runBdInit(this.projectRoot, { quiet: true });
        if (!initResult.ok) {
          return {
            status: 'failed',
            artifacts: [],
            metrics: { durationMs: Date.now() - start },
            errors: [initResult.stderr || initResult.stdout || 'bd init failed.'],
          };
        }
      }

      const readyResult = await runBdReady(this.projectRoot, { json: true });
      const durationMs = Date.now() - start;

      if (!readyResult.ok) {
        return {
          status: 'failed',
          artifacts: [],
          metrics: { durationMs },
          errors: [readyResult.stderr || readyResult.stdout || 'bd ready failed.'],
        };
      }

      let readyPath = null;
      if (readyResult.stdout) {
        try {
          JSON.parse(readyResult.stdout);
          await writeReadyJson(this.projectRoot, readyResult.stdout);
          readyPath = '.beads/ready.json';
        } catch {
          // stdout not valid JSON; skip writing, no readyPath in meta
        }
      }

      const meta = { inited: true };
      if (readyPath) meta.readyPath = readyPath;
      const artifacts = [
        { type: 'beads', path: '.beads', meta },
      ];

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

  async syncRunState(run) {
    if (!run || typeof run.id !== 'string') return;
    try {
      // Ensure .beads exists and write state file without requiring bd (no bd init).
      // writeSdlcRunState does mkdir(.beads, { recursive: true }), so the pipeline mirror
      // always exists even when bd is not installed.
      const plan = run.planJson && Array.isArray(run.planJson) ? run.planJson : [];
      const stepNames = plan.map((s) => (s && s.name) || s).filter(Boolean);
      const updatedAt = run.updatedAt instanceof Date ? run.updatedAt.toISOString() : (run.updatedAt && String(run.updatedAt)) || new Date().toISOString();
      await writeSdlcRunState(this.projectRoot, {
        runId: run.id,
        featureTitle: run.featureTitle,
        status: run.status,
        currentStep: run.currentStep,
        completedSteps: run.completedSteps || [],
        stepNames,
        updatedAt,
      });
    } catch {
      // Non-fatal: do not throw so workflow continues
    }
  }
}

module.exports = { WorkflowBeadsAdapter };
