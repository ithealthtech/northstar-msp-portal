CREATE TABLE integration_resource_mappings (
  provider TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  local_record_id TEXT,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (provider,resource_type,external_id)
) STRICT;

CREATE INDEX integration_mappings_company ON integration_resource_mappings(company_id,provider,resource_type);

CREATE TABLE integration_sync_runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed','rate_limited')),
  requested_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  companies_seen INTEGER NOT NULL DEFAULT 0,
  companies_created INTEGER NOT NULL DEFAULT 0,
  tickets_seen INTEGER NOT NULL DEFAULT 0,
  tickets_upserted INTEGER NOT NULL DEFAULT 0,
  tickets_skipped INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  retry_at TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
) STRICT;

CREATE INDEX integration_sync_runs_provider_started ON integration_sync_runs(provider,started_at DESC);
