'use strict';

const { IEventstormFacilitationPort } = require('../../domain/ports/IEventstormFacilitationPort');

class ClaudeCodeEventstormAdapter extends IEventstormFacilitationPort {
  async runSession(request) {
    throw new Error('Claude Code adapter not implemented');
  }
}

module.exports = { ClaudeCodeEventstormAdapter };
