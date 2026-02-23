'use strict';

class WorkflowController {
  constructor(workflowService) {
    this.workflowService = workflowService;
  }

  async start(request) {
    const body = request.body || {};
    const featureTitle = body.featureTitle;
    const options = body.options;
    return this.workflowService.startWorkflow({ featureTitle, options });
  }

  async resume(request) {
    const body = request.body || {};
    const runId = body.runId;
    return this.workflowService.resumeWorkflow(runId);
  }

  async get(request) {
    const runId = request.params?.id;
    return this.workflowService.getRun(runId);
  }

  async abort(request) {
    const body = request.body || {};
    const runId = body.runId;
    return this.workflowService.abortWorkflow(runId);
  }
}

module.exports = { WorkflowController };
