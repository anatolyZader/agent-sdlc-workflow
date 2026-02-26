'use strict';

/**
 * Controller for the beads workflow step. Delegates to IWorkflowBeadsPort (workflowBeadsAdapter).
 */
class BeadsController {
  constructor(workflowBeadsPort) {
    this.workflowBeadsPort = workflowBeadsPort;
  }

  async run(request) {
    const body = request.body || {};
    return this.workflowBeadsPort.run({
      workflowRunId: body.workflowRunId,
      featureTitle: body.featureTitle,
      planArtifacts: body.planArtifacts,
      ...body,
    });
  }
}

module.exports = { BeadsController };
