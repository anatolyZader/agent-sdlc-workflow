'use strict';

const { buildDefaultStepPlan } = require('./stepPlanFactory');
const { runGate } = require('./gates/gateRunner');

const MAX_STEP_RETRIES_DEFAULT = 2;

class WorkflowService {
  constructor({ workflowRepo, stepExecutor, artifactStore, clock, config, workflowBeadsPort }) {
    this.workflowRepo = workflowRepo;
    this.stepExecutor = stepExecutor;
    this.artifactStore = artifactStore;
    this.clock = clock;
    this.config = config || {};
    this.workflowBeadsPort = workflowBeadsPort || null;
  }

  async _syncRunStateToBeads(run) {
    if (this.workflowBeadsPort && typeof this.workflowBeadsPort.syncRunState === 'function') {
      await this.workflowBeadsPort.syncRunState(run).catch(() => {});
    }
  }

  async startWorkflow(input) {
    const featureTitle = input?.featureTitle;
    if (featureTitle === undefined || featureTitle === null || String(featureTitle).trim() === '') {
      throw new Error('Invalid or missing featureTitle');
    }
    const budgetProfile = input?.options?.budgetProfile;
    if (budgetProfile !== undefined && !['low', 'medium', 'high'].includes(budgetProfile)) {
      throw new Error('Invalid options.budgetProfile; must be low, medium, or high');
    }
    const runId = `wf-${this.clock.now().getTime()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = this.clock.now();
    const planJson = buildDefaultStepPlan();
    const run = {
      id: runId,
      featureTitle: String(featureTitle).trim(),
      status: 'running',
      currentStep: 'eventstorm',
      completedSteps: [],
      artifacts: {},
      currentStepRetries: 0,
      planJson,
      createdAt: now,
      updatedAt: now,
      inputJson: input,
    };
    await this.workflowRepo.save(run);
    await this._syncRunStateToBeads(run);
    return { runId, status: run.status };
  }

  async resumeWorkflow(runId) {
    const run = await this.workflowRepo.get(runId);
    if (!run) {
      throw new Error('Run not found');
    }
    if (run.status !== 'running') {
      return {
        status: run.status,
        currentStep: run.currentStep,
        completedSteps: run.completedSteps || [],
        artifacts: run.artifacts || {},
      };
    }
    const plan = run.planJson && run.planJson.length ? run.planJson : buildDefaultStepPlan();
    const currentIndex = plan.findIndex((s) => s.name === run.currentStep);
    if (currentIndex < 0) {
      return {
        status: run.status,
        currentStep: run.currentStep,
        completedSteps: run.completedSteps || [],
        artifacts: run.artifacts || {},
      };
    }
    const step = plan[currentIndex];
    if (step.mode === 'manualCheckpoint') {
      const updated = {
        ...run,
        status: 'waiting_for_red_commit',
        updatedAt: this.clock.now(),
      };
      await this.workflowRepo.update(updated);
      await this._syncRunStateToBeads(updated);
      return {
        status: updated.status,
        currentStep: run.currentStep,
        completedSteps: run.completedSteps || [],
        artifacts: run.artifacts || {},
      };
    }
    let result = await this.stepExecutor.runStep({
      stepName: run.currentStep,
      workflowRunId: run.id,
      inputs: { run, plan },
    });
    if (result.status === 'ok' && step.exitCriteria?.length) {
      const context = {
        runId: run.id,
        stepName: run.currentStep,
        artifacts: run.artifacts || {},
        jsonPayload: result.rawResult,
      };
      for (const gate of step.exitCriteria) {
        const gateResult = await runGate(gate, context);
        if (!gateResult.passed) {
          result = {
            status: 'failed',
            artifacts: result.artifacts || [],
            metrics: result.metrics || {},
            errors: [gateResult.message || 'Gate failed'],
          };
          break;
        }
      }
    }
    const artifacts = { ...(run.artifacts || {}) };
    if (result.artifacts?.length) {
      for (const a of result.artifacts) {
        if (a.type) artifacts[a.type] = a.path ?? a;
      }
    }
    const now = this.clock.now();
    const maxRetries = this.config.maxStepRetries ?? MAX_STEP_RETRIES_DEFAULT;
    const currentRetries = run.currentStepRetries ?? 0;

    if (result.status === 'failed') {
      if (currentRetries < maxRetries) {
        const updated = {
          ...run,
          currentStepRetries: currentRetries + 1,
          artifacts,
          lastError: result.errors?.[0] || 'Step failed',
          updatedAt: now,
        };
        await this.workflowRepo.update(updated);
        await this._syncRunStateToBeads(updated);
        return {
          status: 'running',
          currentStep: run.currentStep,
          completedSteps: run.completedSteps || [],
          artifacts: updated.artifacts,
          lastError: updated.lastError,
        };
      }
      const updated = {
        ...run,
        status: 'failed',
        currentStep: run.currentStep,
        completedSteps: run.completedSteps || [],
        artifacts,
        lastError: result.errors?.[0] || 'Step failed',
        currentStepRetries: currentRetries,
        updatedAt: now,
      };
      await this.workflowRepo.update(updated);
      await this._syncRunStateToBeads(updated);
      return {
        status: 'failed',
        currentStep: updated.currentStep,
        completedSteps: updated.completedSteps,
        artifacts: updated.artifacts,
        lastError: updated.lastError,
      };
    }
    const completedSteps = [...(run.completedSteps || []), run.currentStep];
    const nextIndex = currentIndex + 1;
    const nextStep = plan[nextIndex];
    const updated = {
      ...run,
      completedSteps,
      artifacts,
      currentStep: nextStep ? nextStep.name : null,
      status: nextStep ? 'running' : 'completed',
      lastError: undefined,
      currentStepRetries: 0,
      updatedAt: now,
    };
    await this.workflowRepo.update(updated);
    await this._syncRunStateToBeads(updated);
    return {
      status: updated.status,
      currentStep: updated.currentStep,
      completedSteps: updated.completedSteps,
      artifacts: updated.artifacts,
    };
  }

  async getRun(runId) {
    const run = await this.workflowRepo.get(runId);
    if (!run) return null;
    return {
      runId: run.id,
      status: run.status,
      currentStep: run.currentStep,
      completedSteps: run.completedSteps || [],
      artifacts: run.artifacts || {},
      lastError: run.lastError,
      planJson: run.planJson,
    };
  }

  async abortWorkflow(runId) {
    const run = await this.workflowRepo.get(runId);
    if (run) {
      const now = this.clock.now();
      const updated = { ...run, status: 'aborted', updatedAt: now };
      await this.workflowRepo.update(updated);
      await this._syncRunStateToBeads(updated);
    }
    return { status: 'aborted' };
  }
}

module.exports = { WorkflowService };
