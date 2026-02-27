'use strict';

/**
 * Cross-cut budget: returns a plan (profile, maxRetries, tokenLimit, etc.) for workflow or other modules.
 * @param {object} options
 * @param {string} [options.profile='medium'] - 'low' | 'medium' | 'high'
 * @param {number} [options.maxRetries]
 * @param {number} [options.tokenLimit]
 * @param {string} [options.qualityFloor]
 * @param {number} [options.escalationLevel]
 * @returns {Promise<{ profile: string, maxRetries: number, tokenLimit: number, qualityFloor: string, escalationLevel: number }>}
 */
async function getPlan(options = {}) {
  const profile = options.profile || 'medium';
  const tokenLimit =
    options.tokenLimit ??
    (profile === 'high' ? 500000 : profile === 'low' ? 50000 : 200000);
  return {
    profile,
    maxRetries: options.maxRetries ?? 2,
    tokenLimit,
    qualityFloor: options.qualityFloor ?? 'pass',
    escalationLevel: options.escalationLevel ?? 0,
  };
}

module.exports = { getPlan };
