'use strict';

class SecureController {
  constructor(secureService) {
    this.secureService = secureService;
  }

  async run(request) {
    const body = request.body || {};
    return this.secureService.run({ workflowRunId: body.workflowRunId, ...body });
  }
}

module.exports = { SecureController };
