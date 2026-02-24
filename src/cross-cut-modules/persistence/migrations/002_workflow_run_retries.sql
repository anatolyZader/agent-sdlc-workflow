-- Add retry count per step for workflow runs
ALTER TABLE workflow_runs ADD COLUMN current_step_retries INTEGER DEFAULT 0;
