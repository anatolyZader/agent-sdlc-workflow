'use strict';

class SpecController {
  constructor(specService) {
    this.specService = specService;
  }

  async run(request) {
    const body = request.body || {};
    return this.specService.run({
      eventstormArtifacts: body.eventstormArtifacts,
      c4Artifacts: body.c4Artifacts,
      workflowRunId: body.workflowRunId,
      featureTitle: body.featureTitle,
      ...body,
    });
  }
}

module.exports = { SpecController };
