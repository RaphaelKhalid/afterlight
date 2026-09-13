ALTER TABLE runs ADD COLUMN lease_owner TEXT;
ALTER TABLE runs ADD COLUMN lease_expires_at TEXT;
CREATE INDEX IF NOT EXISTS idx_runs_lease ON runs(lease_owner, lease_expires_at);
