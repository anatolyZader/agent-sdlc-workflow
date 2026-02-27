'use strict';

/**
 * Port for LLM completion (system/user prompts). Reserved for future use; no adapter
 * implements this port yet. The Claude Code adapter runs the eventstorm-coordinator
 * agent via CLI instead of calling an LLM API directly.
 */
function IEventstormLLMPort() {
  if (new.target === IEventstormLLMPort) {
    throw new Error('IEventstormLLMPort is abstract');
  }
}

/**
 * @param {object} req
 * @param {string} req.system
 * @param {string} req.user
 * @param {object} [req.options]
 * @param {number} [req.options.temperature]
 * @param {number} [req.options.maxTokens]
 * @returns {Promise<{ text: string, usage?: object }>}
 */
IEventstormLLMPort.prototype.complete = function (req) {
  throw new Error('complete not implemented');
};

module.exports = { IEventstormLLMPort };
