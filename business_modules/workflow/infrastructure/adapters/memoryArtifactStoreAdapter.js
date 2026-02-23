'use strict';

const { IWorkflowArtifactStorePort } = require('../../domain/ports/IWorkflowArtifactStorePort');

/**
 * In-memory artifact store (dev/stub). Implements IWorkflowArtifactStorePort.
 */
class MemoryArtifactStoreAdapter extends IWorkflowArtifactStorePort {
  constructor() {
    super();
    this._store = new Map();
    this._counter = 0;
  }

  async store(artifact) {
    const ref = `ref-${++this._counter}`;
    this._store.set(ref, { ...artifact });
    return ref;
  }

  async get(ref) {
    const a = this._store.get(ref);
    return a ? { ...a } : null;
  }
}

module.exports = { MemoryArtifactStoreAdapter };
