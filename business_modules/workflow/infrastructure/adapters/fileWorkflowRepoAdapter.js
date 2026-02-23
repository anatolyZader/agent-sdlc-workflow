'use strict';

const { IWorkflowPersistencePort } = require('../../domain/ports/IWorkflowPersistencePort');

/**
 * In-memory workflow run repo (dev/stub). Implements IWorkflowPersistencePort.
 */
class FileWorkflowRepoAdapter extends IWorkflowPersistencePort {
  constructor() {
    super();
    this._runs = new Map();
  }

  async save(run) {
    this._runs.set(run.id, { ...run });
  }

  async get(runId) {
    const run = this._runs.get(runId);
    return run ? { ...run } : null;
  }

  async update(run) {
    this._runs.set(run.id, { ...run });
  }
}

module.exports = { FileWorkflowRepoAdapter };
