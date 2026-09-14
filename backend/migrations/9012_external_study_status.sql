CREATE TABLE IF NOT EXISTS external_study_status (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  received_at TEXT NOT NULL
);
