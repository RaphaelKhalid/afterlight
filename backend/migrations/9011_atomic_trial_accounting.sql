ALTER TABLE trials ADD COLUMN cost_status TEXT;

CREATE TRIGGER IF NOT EXISTS sync_run_accounting_after_trial_update
AFTER UPDATE OF status, cost_usd, cost_status ON trials
WHEN NEW.status IN ('completed', 'failed', 'ambiguous', 'missing')
   OR OLD.status IN ('completed', 'failed', 'ambiguous', 'missing')
BEGIN
  UPDATE runs
  SET spent_usd = COALESCE((
        SELECT SUM(cost_usd)
        FROM trials
        WHERE run_id = NEW.run_id
          AND status IN ('completed', 'failed', 'ambiguous', 'missing')
      ), 0),
      completed_trials = (
        SELECT COUNT(*) FROM trials WHERE run_id = NEW.run_id AND status = 'completed'
      ),
      failed_trials = (
        SELECT COUNT(*) FROM trials WHERE run_id = NEW.run_id AND status = 'failed'
      ),
      cost_status = CASE
        WHEN EXISTS (
          SELECT 1 FROM trials WHERE run_id = NEW.run_id AND status = 'ambiguous'
        ) THEN 'ambiguous'
        WHEN EXISTS (
          SELECT 1 FROM trials
          WHERE run_id = NEW.run_id
            AND status IN ('completed', 'failed', 'missing')
            AND cost_status = 'estimated'
        ) THEN 'estimated'
        WHEN EXISTS (
          SELECT 1 FROM trials
          WHERE run_id = NEW.run_id
            AND status IN ('completed', 'failed', 'missing')
            AND cost_usd IS NOT NULL
        ) THEN 'provider-returned'
        ELSE cost_status
      END
  WHERE id = NEW.run_id;

  UPDATE budget_reservations
  SET spent_usd = COALESCE((
        SELECT SUM(cost_usd)
        FROM trials
        WHERE run_id = NEW.run_id
          AND status IN ('completed', 'failed', 'ambiguous', 'missing')
      ), 0)
  WHERE run_id = NEW.run_id;
END;

CREATE TRIGGER IF NOT EXISTS sync_terminal_trial_cost_after_scientific_call_insert
AFTER INSERT ON scientific_calls
WHEN EXISTS (
  SELECT 1 FROM trials
  WHERE id = NEW.trial_id AND status IN ('completed', 'failed', 'ambiguous', 'missing')
)
BEGIN
  UPDATE trials
  SET cost_usd = COALESCE((
        SELECT SUM(CASE WHEN cost_usd IS NOT NULL THEN cost_usd ELSE reserved_usd END)
        FROM scientific_calls
        WHERE trial_id = NEW.trial_id
      ), 0),
      cost_status = CASE
        WHEN EXISTS (
          SELECT 1 FROM scientific_calls
          WHERE trial_id = NEW.trial_id AND (cost_usd IS NULL OR cost_basis != 'provider-returned')
        ) THEN 'estimated'
        ELSE 'provider-returned'
      END
  WHERE id = NEW.trial_id;
END;

CREATE TRIGGER IF NOT EXISTS sync_terminal_trial_cost_after_scientific_call_update
AFTER UPDATE OF status, cost_usd, reserved_usd ON scientific_calls
WHEN EXISTS (
  SELECT 1 FROM trials
  WHERE id = NEW.trial_id AND status IN ('completed', 'failed', 'ambiguous', 'missing')
)
BEGIN
  UPDATE trials
  SET cost_usd = COALESCE((
        SELECT SUM(CASE WHEN cost_usd IS NOT NULL THEN cost_usd ELSE reserved_usd END)
        FROM scientific_calls
        WHERE trial_id = NEW.trial_id
      ), 0),
      cost_status = CASE
        WHEN EXISTS (
          SELECT 1 FROM scientific_calls
          WHERE trial_id = NEW.trial_id AND (cost_usd IS NULL OR cost_basis != 'provider-returned')
        ) THEN 'estimated'
        ELSE 'provider-returned'
      END
  WHERE id = NEW.trial_id;
END;

UPDATE trials
SET cost_status = CASE WHEN cost_usd IS NULL THEN NULL ELSE 'estimated' END;
