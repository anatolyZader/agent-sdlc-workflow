'use strict';

const fs = require('fs').promises;

/**
 * Runs gate checks (fileExists, jsonValid, etc.) against step outputs.
 * @param {object} gate - { type: string, params?: object }
 * @param {object} context - { runId, stepName, artifacts?, path?, jsonPayload? }
 * @returns {Promise<{ passed: boolean, message?: string }>}
 */
async function runGate(gate, context) {
  if (!gate || typeof gate.type !== 'string') {
    return { passed: false, message: 'Invalid gate' };
  }
  switch (gate.type) {
    case 'fileExists': {
      const pathToCheck = gate.params?.path ?? context?.path;
      if (!pathToCheck || typeof pathToCheck !== 'string') {
        return { passed: false, message: 'Missing path' };
      }
      try {
        await fs.access(pathToCheck);
        return { passed: true };
      } catch {
        return { passed: false, message: 'File not found' };
      }
    }
    case 'jsonValid': {
      const payload = context?.jsonPayload ?? (context?.artifacts?.[0]?.content);
      if (payload === undefined || payload === null) {
        return { passed: false, message: 'No payload to validate' };
      }
      const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
      try {
        const parsed = JSON.parse(str);
        if (typeof parsed !== 'object' || parsed === null) {
          return { passed: false, message: 'JSON is not an object' };
        }
        return { passed: true };
      } catch {
        return { passed: false, message: 'Invalid JSON' };
      }
    }
    default:
      return { passed: false, message: `Unknown gate type: ${gate.type}` };
  }
}

module.exports = { runGate };
