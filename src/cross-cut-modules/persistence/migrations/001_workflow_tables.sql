-- workflow_runs: main run state
CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  feature_title TEXT NOT NULL,
  status TEXT NOT NULL,
  current_step TEXT,
  completed_steps TEXT NOT NULL DEFAULT '[]',
  artifacts TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  input_json TEXT,
  last_error TEXT
);

-- workflow_artifacts: artifact refs per run (optional, for audit)
CREATE TABLE IF NOT EXISTS workflow_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  type TEXT NOT NULL,
  path TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES workflow_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_artifacts_run_id ON workflow_artifacts(run_id);

-- workflow_events: audit log per run
CREATE TABLE IF NOT EXISTS workflow_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT,
  payload_json TEXT,
  FOREIGN KEY (run_id) REFERENCES workflow_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_events_run_id ON workflow_events(run_id);
