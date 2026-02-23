'use strict';

function RunId(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('RunId must be a non-empty string');
  }
  return value.trim();
}

module.exports = { RunId };
