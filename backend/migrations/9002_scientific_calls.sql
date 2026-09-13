CREATE TABLE IF NOT EXISTS scientific_calls (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  trial_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('subject','monitor')),
  request_hash TEXT NOT NULL,
  request_json TEXT NOT NULL,
  response_json TEXT,
  status TEXT NOT NULL CHECK (status IN ('dispatching','completed','rejected','ambiguous')),
  http_status INTEGER,
  cost_usd REAL,
  reserved_usd REAL NOT NULL DEFAULT 0.01,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (trial_id, stage),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY (trial_id) REFERENCES trials(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_scientific_calls_run ON scientific_calls(run_id);
