'use strict';

class C4Controller {
  constructor(c4Service) {
    this.c4Service = c4Service;
  }

  async run(request) {
    const body = request.body || {};
    return this.c4Service.run({
      eventstormArtifacts: body.eventstormArtifacts,
      workflowRunId: body.workflowRunId,
      ...body,
    });
  }
}

module.exports = { C4Controller };
