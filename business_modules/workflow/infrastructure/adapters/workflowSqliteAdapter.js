'use strict';

const { IWorkflowPersistencePort } = require('../../domain/ports/IWorkflowPersistencePort');

/**
 * SQLite implementation of IWorkflowPersistencePort. Persists to workflow_runs, workflow_artifacts, workflow_events.
 */
class WorkflowSqliteAdapter extends IWorkflowPersistencePort {
  /**
   * @param {{ database: import('better-sqlite3').Database }} options - database injected by DI
   */
  constructor({ database }) {
    super();
    this.db = database;
    if (!this.db) throw new Error('WorkflowSqliteAdapter requires database');
  }

  async save(run) {
    const now = run.createdAt?.toISOString?.() || new Date().toISOString();
    const updated = run.updatedAt?.toISOString?.() || now;
    this.db.prepare(
      `INSERT INTO workflow_runs (id, feature_title, status, current_step, completed_steps, artifacts, created_at, updated_at, input_json, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      run.id,
      run.featureTitle || '',
      run.status || 'running',
      run.currentStep ?? null,
      JSON.stringify(run.completedSteps || []),
      JSON.stringify(run.artifacts || {}),
      now,
      updated,
      run.inputJson ? JSON.stringify(run.inputJson) : null,
      run.lastError ?? null
    );
    this._appendEvent(run.id, 'run_created', 'Run created', { status: run.status });
  }

  async get(runId) {
    const row = this.db.prepare(
      'SELECT id, feature_title, status, current_step, completed_steps, artifacts, created_at, updated_at, input_json, last_error FROM workflow_runs WHERE id = ?'
    ).get(runId);
    if (!row) return null;
    return {
      id: row.id,
      featureTitle: row.feature_title,
      status: row.status,
      currentStep: row.current_step,
      completedSteps: JSON.parse(row.completed_steps || '[]'),
      artifacts: JSON.parse(row.artifacts || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      inputJson: row.input_json ? JSON.parse(row.input_json) : undefined,
      lastError: row.last_error,
    };
  }

  async update(run) {
    const updated = run.updatedAt?.toISOString?.() || new Date().toISOString();
    this.db.prepare(
      `UPDATE workflow_runs SET feature_title = ?, status = ?, current_step = ?, completed_steps = ?, artifacts = ?, updated_at = ?, input_json = ?, last_error = ? WHERE id = ?`
    ).run(
      run.featureTitle || '',
      run.status || 'running',
      run.currentStep ?? null,
      JSON.stringify(run.completedSteps || []),
      JSON.stringify(run.artifacts || {}),
      updated,
      run.inputJson ? JSON.stringify(run.inputJson) : null,
      run.lastError ?? null,
      run.id
    );
    this._appendEvent(run.id, 'run_updated', 'Run updated', { status: run.status });
  }

  _appendEvent(runId, level, message, payload) {
    const ts = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO workflow_events (run_id, ts, level, message, payload_json) VALUES (?, ?, ?, ?, ?)'
    ).run(runId, ts, level, message, payload ? JSON.stringify(payload) : null);
  }
}

module.exports = { WorkflowSqliteAdapter };
