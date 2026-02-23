'use strict';

class EventstormController {
  constructor(eventstormService) {
    this.eventstormService = eventstormService;
  }

  async run(request) {
    const body = request.body || {};
    return this.eventstormService.runSession({
      domainName: body.domainName,
      problemStatement: body.problemStatement,
      constraints: body.constraints,
      timeboxMinutes: body.timeboxMinutes,
      contextSnippets: body.contextSnippets,
    });
  }
}

module.exports = { EventstormController };
