'use strict';

const { buildDefaultStepPlan } = require('./stepPlanFactory');

class WorkflowService {
  constructor(workflowRepo, stepExecutor, artifactStore, clock) {
    this.workflowRepo = workflowRepo;
    this.stepExecutor = stepExecutor;
    this.artifactStore = artifactStore;
    this.clock = clock;
  }

  async startWorkflow(input) {
    const featureTitle = input?.featureTitle;
    if (featureTitle === undefined || featureTitle === null || String(featureTitle).trim() === '') {
      throw new Error('Invalid or missing featureTitle');
    }
    const runId = `wf-${this.clock.now().getTime()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = this.clock.now();
    const run = {
      id: runId,
      featureTitle: String(featureTitle).trim(),
      status: 'running',
      currentStep: 'eventstorm',
      completedSteps: [],
      artifacts: {},
      createdAt: now,
      updatedAt: now,
      inputJson: input,
    };
    await this.workflowRepo.save(run);
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
    const plan = buildDefaultStepPlan();
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
      return {
        status: updated.status,
        currentStep: run.currentStep,
        completedSteps: run.completedSteps || [],
        artifacts: run.artifacts || {},
      };
    }
    const result = await this.stepExecutor.runStep({
      stepName: run.currentStep,
      workflowRunId: run.id,
      inputs: { run, plan },
    });
    const artifacts = { ...(run.artifacts || {}) };
    if (result.artifacts?.length) {
      for (const a of result.artifacts) {
        if (a.type) artifacts[a.type] = a.path ?? a;
      }
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
      lastError: result.status === 'failed' ? (result.errors?.[0] || 'Step failed') : undefined,
      updatedAt: this.clock.now(),
    };
    await this.workflowRepo.update(updated);
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
    };
  }

  async abortWorkflow(runId) {
    const run = await this.workflowRepo.get(runId);
    if (run) {
      const now = this.clock.now();
      await this.workflowRepo.update({ ...run, status: 'aborted', updatedAt: now });
    }
    return { status: 'aborted' };
  }
}

module.exports = { WorkflowService };
