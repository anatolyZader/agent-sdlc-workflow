'use strict';

class TddController {
  constructor({ tddService }) {
    this.tddService = tddService;
  }

  async run(request) {
    const body = request.body || {};
    return this.tddService.run({
      phase: body.phase || 'red',
      workflowRunId: body.workflowRunId,
      specArtifacts: body.specArtifacts,
      eventstormArtifacts: body.eventstormArtifacts,
      ...body,
    });
  }
}

module.exports = { TddController };
