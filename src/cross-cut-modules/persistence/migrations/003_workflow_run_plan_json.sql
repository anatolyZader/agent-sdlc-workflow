-- Store step plan JSON per run for visibility in run state
ALTER TABLE workflow_runs ADD COLUMN plan_json TEXT;
