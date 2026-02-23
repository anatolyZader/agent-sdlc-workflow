'use strict';

class DocController {
  constructor(docService) {
    this.docService = docService;
  }

  async run(request) {
    const body = request.body || {};
    return this.docService.run({ workflowRunId: body.workflowRunId, ...body });
  }
}

module.exports = { DocController };
