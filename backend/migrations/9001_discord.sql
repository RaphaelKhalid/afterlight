CREATE TABLE IF NOT EXISTS discord_attempts (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id),
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'started',
  result_run_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(question_id, user_id, guild_id)
);
CREATE TABLE IF NOT EXISTS discord_interactions (
  interaction_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
