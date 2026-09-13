PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  authors_json TEXT NOT NULL,
  published TEXT NOT NULL,
  updated TEXT,
  url TEXT NOT NULL,
  version TEXT,
  source_type TEXT NOT NULL,
  abstract TEXT NOT NULL,
  topics_json TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  area TEXT NOT NULL,
  status TEXT NOT NULL,
  origin TEXT NOT NULL,
  summary TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  source_json TEXT NOT NULL,
  closest_work_json TEXT NOT NULL,
  uncertainty TEXT NOT NULL,
  search_json TEXT NOT NULL,
  executable INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL,
  estimated_minutes INTEGER,
  access TEXT NOT NULL,
  position_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  type TEXT NOT NULL,
  explanation TEXT NOT NULL,
  evidence_url TEXT
);

CREATE TABLE IF NOT EXISTS contracts (
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  hash TEXT NOT NULL,
  question_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','validated','retired')),
  contract_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (id, version),
  UNIQUE (id, hash),
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  contract_version INTEGER NOT NULL,
  contract_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','validated','queued','running','paused','completed','failed','stopped')),
  cap_usd REAL NOT NULL CHECK (cap_usd >= 0),
  spent_usd REAL NOT NULL DEFAULT 0 CHECK (spent_usd >= 0),
  cost_status TEXT NOT NULL DEFAULT 'estimated' CHECK (cost_status IN ('estimated','provider-returned','ambiguous')),
  total_trials INTEGER NOT NULL,
  completed_trials INTEGER NOT NULL DEFAULT 0,
  failed_trials INTEGER NOT NULL DEFAULT 0,
  conditions_json TEXT NOT NULL DEFAULT '[]',
  started_at TEXT,
  completed_at TEXT,
  workflow_instance_id TEXT,
  summary_json TEXT,
  artifact_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (question_id) REFERENCES questions(id),
  FOREIGN KEY (contract_id, contract_version) REFERENCES contracts(id, version)
);

CREATE TABLE IF NOT EXISTS trials (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  condition_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed','ambiguous','missing')),
  input_json TEXT NOT NULL,
  output_json TEXT,
  answer TEXT,
  expected_answer TEXT,
  score REAL,
  monitor_verdict TEXT,
  provider TEXT,
  model TEXT,
  usage_json TEXT,
  cost_usd REAL,
  error_code TEXT,
  external_request_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (run_id, case_id, condition_id),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  type TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (run_id, id),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS budget_reservations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  reserved_usd REAL NOT NULL CHECK (reserved_usd >= 0),
  spent_usd REAL NOT NULL DEFAULT 0 CHECK (spent_usd >= 0),
  status TEXT NOT NULL CHECK (status IN ('held','released')),
  created_at TEXT NOT NULL,
  released_at TEXT
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  telegram_chat_id TEXT NOT NULL,
  telegram_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'started',
  result_run_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (question_id, telegram_chat_id, telegram_user_id),
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_events (
  update_id TEXT PRIMARY KEY,
  callback_key TEXT UNIQUE,
  chat_id TEXT,
  user_id TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publications (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  artifact_hash TEXT NOT NULL,
  repository_url TEXT NOT NULL,
  publication_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested','published','failed')),
  response_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (run_id, artifact_hash),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS investigations (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  query TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  response_json TEXT,
  cost_usd REAL NOT NULL DEFAULT 0.1,
  status TEXT NOT NULL CHECK (status IN ('requested','completed','failed','ambiguous')),
  created_at TEXT NOT NULL,
  UNIQUE (question_id, query),
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
CREATE INDEX IF NOT EXISTS idx_runs_question ON runs(question_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trials_run ON trials(run_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_events_run ON run_events(run_id, created_at);
