'use strict';

const { StateGraph, END, START, Annotation } = require('@langchain/langgraph');
const { IWorkflowStepExecutorPort } = require('../../domain/ports/IWorkflowStepExecutorPort');
const { runGate } = require('../../app/gates/gateRunner');

/**
 * LangGraph state for a single step execution.
 * Tracks step input, execution result, gate evaluation, and final outcome.
 */
const StepExecutionState = Annotation.Root({
  stepName: Annotation({ reducer: (x, y) => (y !== undefined ? y : x), default: () => '' }),
  run: Annotation({ reducer: (x, y) => (y !== undefined ? y : x), default: () => ({}) }),
  plan: Annotation({ reducer: (x, y) => (y !== undefined ? y : x), default: () => [] }),
  result: Annotation({ reducer: (x, y) => (y !== undefined ? y : x), default: () => null }),
  gatesPassed: Annotation({ reducer: (x, y) => (y !== undefined ? y : x), default: () => true }),
  gateError: Annotation({ reducer: (x, y) => (y !== undefined ? y : x), default: () => null }),
  durationMs: Annotation({ reducer: (x, y) => (y !== undefined ? y : x), default: () => 0 }),
});

/**
 * LangGraph state for the full SDLC pipeline.
 * Mirrors the WorkflowRun fields used during orchestration.
 */
const SdlcPipelineState = Annotation.Root({
  runId: Annotation({ reducer: (x, y) => (y !== undefined ? y : x), default: () => '' }),
  featureTitle: Annotation({ reducer: (x, y) => (y !== undefined ? y : x), default: () => '' }),
  status: Annotation({ reducer: (x, y) => (y !== undefined ? y : x), default: () => 'running' }),
  currentStep: Annotation({ reducer: (x, y) => (y !== undefined ? y : x), default: () => null }),
  completedSteps: Annotation({ reducer: (x, y) => (y !== undefined ? y : x), default: () => [] }),
  artifacts: Annotation({ reducer: (x, y) => (y !== undefined ? y : x), default: () => ({}) }),
  lastError: Annotation({ reducer: (x, y) => (y !== undefined ? y : x), default: () => null }),
  currentStepRetries: Annotation({ reducer: (x, y) => (y !== undefined ? y : x), default: () => 0 }),
  planJson: Annotation({ reducer: (x, y) => (y !== undefined ? y : x), default: () => [] }),
  inputJson: Annotation({ reducer: (x, y) => (y !== undefined ? y : x), default: () => ({}) }),
});

/**
 * Builds the body to pass to a step controller for a given step name.
 * Mirrors the logic in InProcessStepExecutorAdapter._bodyForStep.
 * @param {string} stepName
 * @param {object} run
 * @returns {object}
 */
function bodyForStep(stepName, run) {
  const r = run || {};
  const artifacts = r.artifacts || {};
  const base = { workflowRunId: r.id };
  switch (stepName) {
    case 'eventstorm':
      return {
        domainName: r.featureTitle || 'feature',
        problemStatement: r.inputJson?.problemStatement || r.featureTitle || '',
        ...base,
      };
    case 'c4':
      return { eventstormArtifacts: artifacts.eventstorm, ...base };
    case 'spec':
      return {
        eventstormArtifacts: artifacts.eventstorm,
        c4Artifacts: artifacts.c4,
        featureTitle: r.featureTitle,
        ...base,
      };
    case 'plan':
      return { specArtifacts: artifacts.spec, featureTitle: r.featureTitle, ...base };
    case 'beads':
      return { planArtifacts: artifacts.plan, featureTitle: r.featureTitle, ...base };
    case 'tdd_red':
      return { phase: 'red', specArtifacts: artifacts.spec, eventstormArtifacts: artifacts.eventstorm, ...base };
    case 'tdd_green':
      return { phase: 'green', specArtifacts: artifacts.spec, eventstormArtifacts: artifacts.eventstorm, ...base };
    case 'lint':
    case 'secure':
    case 'doc':
      return { ...artifacts, ...base };
    default:
      return base;
  }
}

/**
 * Normalises a raw controller result into the standard step envelope.
 * @param {*} result
 * @param {number} durationMs
 * @returns {{ status: string, artifacts: Array, metrics: object, errors: Array, logs: Array }}
 */
function toEnvelope(result, durationMs) {
  const baseMetrics = { durationMs };
  if (result && typeof result.metrics === 'object' && result.metrics != null) {
    if (result.metrics.charsIn != null) baseMetrics.charsIn = result.metrics.charsIn;
    if (result.metrics.charsOut != null) baseMetrics.charsOut = result.metrics.charsOut;
  }
  if (result && typeof result.status === 'string' && Array.isArray(result.artifacts)) {
    return {
      status: result.status,
      artifacts: result.artifacts || [],
      metrics: { ...baseMetrics, ...(result.metrics || {}) },
      errors: result.errors || [],
      logs: result.logs || [],
    };
  }
  return {
    status: 'ok',
    artifacts: [],
    metrics: { ...baseMetrics },
    errors: [],
    logs: result?.logs || [],
    rawResult: result,
  };
}

/**
 * Builds a compiled LangGraph StateGraph for executing a single workflow step.
 * The graph has two nodes:
 *   - execute_step  : calls the step controller and records the raw result
 *   - check_gates   : evaluates exitCriteria gates and may downgrade status to 'failed'
 * A conditional edge after execute_step routes to check_gates only when the step
 * succeeded and the step definition has exitCriteria; otherwise it routes to END.
 *
 * @param {object} controller   Step controller with a run({ body }) method.
 * @param {Array}  exitCriteria Array of gate definitions (may be empty).
 * @param {number} timeoutMs    Step execution timeout in milliseconds.
 * @returns {import('@langchain/langgraph').CompiledStateGraph}
 */
function buildStepGraph(controller, exitCriteria, timeoutMs) {
  const hasGates = Array.isArray(exitCriteria) && exitCriteria.length > 0;

  const graph = new StateGraph(StepExecutionState)
    .addNode('execute_step', async (state) => {
      const start = Date.now();
      try {
        const request = { body: bodyForStep(state.stepName, state.run) };
        const raw = await Promise.race([
          controller.run(request),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Step timeout')), timeoutMs)
          ),
        ]);
        const durationMs = Date.now() - start;
        return { result: toEnvelope(raw, durationMs), durationMs };
      } catch (err) {
        const durationMs = Date.now() - start;
        return {
          result: {
            status: 'failed',
            artifacts: [],
            metrics: { durationMs },
            errors: [err.message || String(err)],
            logs: [],
          },
          durationMs,
        };
      }
    })
    .addNode('check_gates', async (state) => {
      const result = state.result;
      const context = {
        runId: state.run?.id,
        stepName: state.stepName,
        artifacts: state.run?.artifacts || {},
        jsonPayload: result?.rawResult,
      };
      for (const gate of exitCriteria) {
        const gateResult = await runGate(gate, context);
        if (!gateResult.passed) {
          return {
            gatesPassed: false,
            gateError: gateResult.message || 'Gate failed',
            result: {
              ...result,
              status: 'failed',
              errors: [gateResult.message || 'Gate failed'],
            },
          };
        }
      }
      return { gatesPassed: true, gateError: null };
    })
    .addEdge(START, 'execute_step')
    .addConditionalEdges('execute_step', (state) => {
      if (hasGates && state.result?.status === 'ok') return 'check_gates';
      return END;
    })
    .addEdge('check_gates', END);

  return graph.compile();
}

/**
 * Builds a compiled LangGraph StateGraph that represents the full SDLC pipeline.
 * Each SDLC step is a node; conditional edges advance or halt the pipeline based on
 * step results and gate checks.  Manual-checkpoint steps (mode: 'manualCheckpoint')
 * immediately set status to 'waiting_for_red_commit' and route to END.
 *
 * @param {Array<{ name: string, mode: string, exitCriteria?: Array }>} plan
 *   Ordered step plan (e.g. from buildDefaultStepPlan()).
 * @param {object} controllers
 *   Map of stepName → controller (must have a run({ body }) method).
 * @param {{ stepTimeoutMs?: number, maxStepRetries?: number }} options
 * @returns {import('@langchain/langgraph').CompiledStateGraph}
 */
function buildSdlcPipelineGraph(plan, controllers, options = {}) {
  const timeoutMs = options.stepTimeoutMs ?? 300000;
  const maxRetries = options.maxStepRetries ?? 2;

  const graph = new StateGraph(SdlcPipelineState);

  for (const step of plan) {
    const stepName = step.name;
    const controller = controllers[stepName];
    const exitCriteria = step.exitCriteria || [];

    graph.addNode(stepName, async (state) => {
      // Manual checkpoint: pause and signal caller
      if (step.mode === 'manualCheckpoint') {
        return { status: 'waiting_for_red_commit' };
      }

      if (!controller) {
        return {
          status: 'failed',
          lastError: `No controller registered for step: ${stepName}`,
        };
      }

      const start = Date.now();
      let result;
      try {
        const run = {
          id: state.runId,
          featureTitle: state.featureTitle,
          artifacts: state.artifacts || {},
          inputJson: state.inputJson || {},
        };
        const request = { body: bodyForStep(stepName, run) };
        const raw = await Promise.race([
          controller.run(request),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Step timeout')), timeoutMs)
          ),
        ]);
        result = toEnvelope(raw, Date.now() - start);
      } catch (err) {
        result = {
          status: 'failed',
          artifacts: [],
          metrics: { durationMs: Date.now() - start },
          errors: [err.message || String(err)],
          logs: [],
        };
      }

      // Gate checks
      if (result.status === 'ok' && exitCriteria.length > 0) {
        const context = {
          runId: state.runId,
          stepName,
          artifacts: state.artifacts || {},
          jsonPayload: result.rawResult,
        };
        for (const gate of exitCriteria) {
          const gateResult = await runGate(gate, context);
          if (!gateResult.passed) {
            result = {
              ...result,
              status: 'failed',
              errors: [gateResult.message || 'Gate failed'],
            };
            break;
          }
        }
      }

      // Merge artifacts
      const artifacts = { ...(state.artifacts || {}) };
      if (result.artifacts?.length) {
        for (const a of result.artifacts) {
          if (a.type) artifacts[a.type] = a.path ?? a;
        }
      }

      if (result.status === 'failed') {
        const retries = state.currentStepRetries ?? 0;
        if (retries < maxRetries) {
          return {
            currentStepRetries: retries + 1,
            artifacts,
            lastError: result.errors?.[0] || 'Step failed',
          };
        }
        return {
          status: 'failed',
          artifacts,
          lastError: result.errors?.[0] || 'Step failed',
        };
      }

      // Success: advance
      const completedSteps = [...(state.completedSteps || []), stepName];
      const nextIndex = plan.findIndex((s) => s.name === stepName) + 1;
      const nextStep = plan[nextIndex];
      return {
        completedSteps,
        artifacts,
        currentStep: nextStep ? nextStep.name : null,
        currentStepRetries: 0,
        lastError: null,
        status: nextStep ? 'running' : 'completed',
      };
    });
  }

  // Wire edges
  graph.addEdge(START, plan[0].name);

  for (let i = 0; i < plan.length; i++) {
    const step = plan[i];
    const next = plan[i + 1];

    if (step.mode === 'manualCheckpoint') {
      // Stop graph at manual checkpoint
      graph.addEdge(step.name, END);
      continue;
    }

    graph.addConditionalEdges(step.name, (state) => {
      if (state.status === 'failed') return END;
      if (state.status === 'waiting_for_red_commit') return END;
      if (state.status === 'completed') return END;
      // retry: stay on same step
      if (state.currentStep === step.name) return step.name;
      return next ? next.name : END;
    });
  }

  return graph.compile();
}

/**
 * LangGraph-based step executor.
 *
 * Drop-in replacement for InProcessStepExecutorAdapter that implements
 * IWorkflowStepExecutorPort.  Each call to runStep() compiles and invokes
 * a small two-node LangGraph (execute_step → check_gates) so that gate
 * evaluation is an explicit graph node rather than inline code.
 *
 * Also exposes buildSdlcPipelineGraph() as a static helper so callers can
 * obtain the full SDLC pipeline as a compiled LangGraph for visualisation or
 * end-to-end execution.
 */
class LangGraphWorkflowAdapter extends IWorkflowStepExecutorPort {
  /**
   * @param {object} deps
   * @param {object} deps.eventstormController
   * @param {object} deps.c4Controller
   * @param {object} deps.specController
   * @param {object} deps.planController
   * @param {object} deps.beadsController
   * @param {object} deps.tddController
   * @param {object} deps.lintController
   * @param {object} deps.secureController
   * @param {object} deps.docController
   * @param {object} deps.config
   */
  constructor({
    eventstormController,
    c4Controller,
    specController,
    planController,
    beadsController,
    tddController,
    lintController,
    secureController,
    docController,
    config,
  }) {
    super();
    this.controllers = {
      eventstorm: eventstormController,
      c4: c4Controller,
      spec: specController,
      plan: planController,
      beads: beadsController,
      tdd_red: tddController,
      tdd_green: tddController,
      lint: lintController,
      secure: secureController,
      doc: docController,
    };
    this.stepTimeoutMs = config?.stepTimeoutMs ?? 300000;
    this.config = config ?? {};
  }

  /**
   * Execute a single workflow step using a compiled LangGraph that explicitly
   * models step execution and gate evaluation as separate graph nodes.
   *
   * @param {{ stepName: string, inputs: { run: object, plan: Array } }} params
   * @returns {Promise<{ status: string, artifacts: Array, metrics: object, errors: Array }>}
   */
  async runStep(params) {
    const { stepName, inputs } = params;
    const { run, plan } = inputs || {};
    const controller = this.controllers[stepName];

    if (!controller) {
      return {
        status: 'failed',
        artifacts: [],
        metrics: { durationMs: 0 },
        errors: [`Unknown step: ${stepName}`],
      };
    }

    const stepDef = Array.isArray(plan) ? plan.find((s) => s.name === stepName) : null;
    const exitCriteria = stepDef?.exitCriteria || [];

    const stepGraph = buildStepGraph(controller, exitCriteria, this.stepTimeoutMs);
    const finalState = await stepGraph.invoke({
      stepName,
      run: run || {},
      plan: plan || [],
    });

    return finalState.result || {
      status: 'failed',
      artifacts: [],
      metrics: { durationMs: finalState.durationMs ?? 0 },
      errors: ['Step graph returned no result'],
    };
  }

  /**
   * Build and return a compiled LangGraph StateGraph representing the full
   * SDLC pipeline.  Nodes correspond to SDLC steps; conditional edges handle
   * retries, gate failures, manual checkpoints, and step advancement.
   *
   * Useful for pipeline visualisation and end-to-end execution outside the
   * HTTP resume loop.
   *
   * @param {Array<{ name: string, mode: string, exitCriteria?: Array }>} plan
   * @returns {import('@langchain/langgraph').CompiledStateGraph}
   */
  buildPipelineGraph(plan) {
    return buildSdlcPipelineGraph(plan, this.controllers, {
      stepTimeoutMs: this.stepTimeoutMs,
      maxStepRetries: this.config.maxStepRetries ?? 2,
    });
  }
}

module.exports = {
  LangGraphWorkflowAdapter,
  buildSdlcPipelineGraph,
  buildStepGraph,
};
