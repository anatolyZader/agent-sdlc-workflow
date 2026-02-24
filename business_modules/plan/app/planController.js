'use strict';

class PlanController {
  constructor(planService) {
    this.planService = planService;
  }

  async run(request) {
    const body = request.body || {};
    return this.planService.run({
      specArtifacts: body.specArtifacts,
      workflowRunId: body.workflowRunId,
      featureTitle: body.featureTitle,
      ...body,
    });
  }
}

module.exports = { PlanController };
