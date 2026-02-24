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
    case 'requiredKeys': {
      const payload = context?.jsonPayload;
      const keys = gate.params?.keys;
      if (!Array.isArray(keys) || keys.length === 0) {
        return { passed: false, message: 'Missing keys to check' };
      }
      if (payload === undefined || payload === null) {
        return { passed: false, message: 'No payload to validate' };
      }
      const obj = typeof payload === 'object' ? payload : {};
      const missing = keys.filter((k) => !(k in obj));
      if (missing.length > 0) {
        return { passed: false, message: `Missing required keys: ${missing.join(', ')}` };
      }
      return { passed: true };
    }
    case 'qualityGateGreen':
      return context?.artifacts?.lintPassed === true
        ? { passed: true }
        : { passed: false, message: 'Lint/quality gate not green' };
    case 'testsGreen':
      return context?.artifacts?.testsPassed === true
        ? { passed: true }
        : { passed: false, message: 'Tests not green' };
    case 'securityNoHigh': {
      const highCount = context?.artifacts?.highSeverityCount ?? context?.artifacts?.highFindings ?? 0;
      return highCount === 0 ? { passed: true } : { passed: false, message: 'Security gate: high severity findings present' };
    }
    case 'userConfirm':
      return context?.userConfirmed === true
        ? { passed: true }
        : { passed: false, message: 'User confirmation required' };
    default:
      return { passed: false, message: `Unknown gate type: ${gate.type}` };
  }
}

module.exports = { runGate };
