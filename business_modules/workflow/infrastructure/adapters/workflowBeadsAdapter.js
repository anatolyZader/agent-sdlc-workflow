'use strict';

const path = require('path');
const fs = require('fs').promises;
const { IWorkflowBeadsPort } = require('../../domain/ports/IWorkflowBeadsPort');
const { runBdInit, runBdAdd, isBeadsInited, writeSdlcRunState, parsePlanMarkdown } = require('../../../../beadsCli');

class WorkflowBeadsAdapter extends IWorkflowBeadsPort {
  constructor({ config }) {
    super();
    this.config = config;
    this.projectRoot = config?.projectRoot ?? process.cwd();
  }

  /**
   * Convert the plan artifacts into a Beads task graph.
   * Parses the plan.md produced by the plan step and creates a bd task for each
   * item so that agents can use `bd ready` to choose their next coding task.
   * Falls back to a single feature-level task when no readable plan is available.
   */
  async run(inputs) {
    const start = Date.now();
    try {
      // Ensure beads is initialised
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

      // Resolve plan artifact path from inputs
      const planArtifacts = inputs?.planArtifacts;
      let planPath = null;
      if (typeof planArtifacts === 'string') planPath = planArtifacts;
      else if (planArtifacts?.path) planPath = planArtifacts.path;
      else if (Array.isArray(planArtifacts) && planArtifacts[0]?.path) planPath = planArtifacts[0].path;

      // Parse task titles from plan.md; fall back to a feature-level task
      let taskTitles = [];
      if (planPath) {
        try {
          const content = await fs.readFile(planPath, 'utf8');
          taskTitles = parsePlanMarkdown(content);
        } catch {
          // Unreadable plan file (missing, permission issue, etc.) — fall through to feature-level fallback.
          // Intentionally non-fatal: the beads task graph is best-effort enrichment;
          // the pipeline must continue regardless.
        }
      }
      if (taskTitles.length === 0) {
        taskTitles = [inputs?.featureTitle || 'Implement feature'];
      }

      // Create a bd task for each plan item
      const createdTasks = [];
      for (const title of taskTitles) {
        const addResult = await runBdAdd(this.projectRoot, title);
        if (addResult.ok) createdTasks.push(title);
      }

      const durationMs = Date.now() - start;
      const beadsDir = path.join(this.projectRoot, '.beads');
      return {
        status: 'ok',
        artifacts: [{ type: 'beads', path: beadsDir, meta: { tasks: createdTasks } }],
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
      const inited = await isBeadsInited(this.projectRoot);
      if (!inited) {
        const initResult = await runBdInit(this.projectRoot, { quiet: true });
        if (!initResult.ok) return;
      }
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
