'use strict';

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
