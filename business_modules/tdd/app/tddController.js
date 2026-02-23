'use strict';

class TddController {
  constructor(tddService) {
    this.tddService = tddService;
  }

  async runRed(request) {
    const body = request.body || {};
    return this.tddService.runRed({ workflowRunId: body.workflowRunId, specArtifacts: body.specArtifacts, ...body });
  }

  async runGreen(request) {
    const body = request.body || {};
    return this.tddService.runGreen({ workflowRunId: body.workflowRunId, specArtifacts: body.specArtifacts, ...body });
  }
}

module.exports = { TddController };
