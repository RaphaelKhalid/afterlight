ALTER TABLE scientific_calls ADD COLUMN cost_basis TEXT NOT NULL DEFAULT 'unavailable';
UPDATE scientific_calls SET cost_basis='provider-returned' WHERE cost_usd IS NOT NULL AND json_extract(response_json,'$.usage.cost') IS NOT NULL;
