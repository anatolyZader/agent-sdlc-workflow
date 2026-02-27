'use strict';

class EventstormController {
  constructor(eventstormService) {
    this.eventstormService = eventstormService;
  }

  async run(request) {
    const body = request.body || {};
    if (!body.rawText && (!body.domainName || !body.problemStatement)) {
      throw new Error('Either rawText or both domainName and problemStatement are required');
    }
    return this.eventstormService.runSession({
      rawText: body.rawText,
      sessionId: body.sessionId,
      domainName: body.domainName,
      problemStatement: body.problemStatement,
      constraints: body.constraints,
      timeboxMinutes: body.timeboxMinutes,
      contextSnippets: body.contextSnippets,
      signal: request.signal,
    });
  }
}

module.exports = { EventstormController };
