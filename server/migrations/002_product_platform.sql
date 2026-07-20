CREATE TABLE IF NOT EXISTS portal_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value_json TEXT NOT NULL CHECK (json_valid(setting_value_json)),
  scope TEXT NOT NULL DEFAULT 'msp' CHECK (scope IN ('msp','company','user')),
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE IF NOT EXISTS portal_records (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('ticket','document','asset','invoice','renewal','person','password_request','remote_session','metric','approval','note')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  source_system TEXT NOT NULL DEFAULT 'portal',
  source_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json)),
  visible_to_client INTEGER NOT NULL DEFAULT 1 CHECK (visible_to_client IN (0,1)),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE INDEX IF NOT EXISTS portal_records_company_type_status ON portal_records(company_id,record_type,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requested_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','cancelled')),
  decision_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  decision_at TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE INDEX IF NOT EXISTS approval_requests_company_status ON approval_requests(company_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS install_profiles (
  id TEXT PRIMARY KEY,
  profile_name TEXT NOT NULL UNIQUE,
  database_provider TEXT NOT NULL DEFAULT 'sqlite' CHECK (database_provider IN ('sqlite','postgres','sqlserver')),
  deployment_target TEXT NOT NULL DEFAULT 'node' CHECK (deployment_target IN ('node','windows-service','docker','iis-reverse-proxy')),
  public_url TEXT,
  options_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(options_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
