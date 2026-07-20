CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  external_key TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','onboarding','suspended','archived')),
  plan_name TEXT NOT NULL DEFAULT 'Managed Services',
  primary_domain TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  entra_tenant_id TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(settings_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  entra_tenant_id TEXT,
  entra_object_id TEXT,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited','active','disabled')),
  platform_role TEXT NOT NULL DEFAULT 'none' CHECK (platform_role IN ('none','msp_operator','msp_admin','msp_owner')),
  platform_scope TEXT NOT NULL DEFAULT 'assigned' CHECK (platform_scope IN ('assigned','all')),
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (entra_tenant_id, entra_object_id)
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_nocase ON users(lower(email));

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('client_user','client_admin','client_owner')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited','active','suspended','revoked')),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, company_id)
) STRICT;

CREATE INDEX IF NOT EXISTS memberships_company_status ON memberships(company_id,status);
CREATE INDEX IF NOT EXISTS memberships_user_status ON memberships(user_id,status);

CREATE TABLE IF NOT EXISTS msp_company_scopes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id,company_id)
) STRICT;

CREATE TABLE IF NOT EXISTS feature_entitlements (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  configuration_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(configuration_json)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (company_id,feature_key)
) STRICT;

CREATE TABLE IF NOT EXISTS company_snapshots (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  health_score REAL NOT NULL DEFAULT 0,
  security_score REAL NOT NULL DEFAULT 0,
  open_tickets INTEGER NOT NULL DEFAULT 0,
  managed_users INTEGER NOT NULL DEFAULT 0,
  managed_devices INTEGER NOT NULL DEFAULT 0,
  monthly_recurring_revenue_cents INTEGER NOT NULL DEFAULT 0,
  sla_attainment REAL NOT NULL DEFAULT 0,
  snapshot_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(snapshot_json)),
  captured_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE IF NOT EXISTS integration_connections (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','connected','degraded','disabled')),
  sync_state TEXT NOT NULL DEFAULT 'idle' CHECK (sync_state IN ('idle','syncing','healthy','warning','failed')),
  client_visible INTEGER NOT NULL DEFAULT 0 CHECK (client_visible IN (0,1)),
  secret_reference TEXT,
  configuration_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(configuration_json)),
  last_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (company_id,provider)
) STRICT;

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success','denied','failure')),
  reason_code TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE INDEX IF NOT EXISTS audit_company_created ON audit_events(company_id,created_at DESC);
CREATE INDEX IF NOT EXISTS audit_actor_created ON audit_events(actor_user_id,created_at DESC);
