'use strict';

class LintController {
  constructor(lintService) {
    this.lintService = lintService;
  }

  async run(request) {
    const body = request.body || {};
    return this.lintService.run({ workflowRunId: body.workflowRunId, ...body });
  }
}

module.exports = { LintController };
