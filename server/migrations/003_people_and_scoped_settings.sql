ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN department TEXT;
ALTER TABLE users ADD COLUMN job_title TEXT;
ALTER TABLE users ADD COLUMN location TEXT;
ALTER TABLE users ADD COLUMN timezone TEXT;
ALTER TABLE users ADD COLUMN manager_name TEXT;
ALTER TABLE users ADD COLUMN preferred_contact TEXT;
ALTER TABLE users ADD COLUMN profile_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(profile_json));

CREATE TABLE portal_settings_v2 (
  setting_id TEXT PRIMARY KEY,
  setting_key TEXT NOT NULL,
  setting_value_json TEXT NOT NULL CHECK (json_valid(setting_value_json)),
  scope TEXT NOT NULL DEFAULT 'msp' CHECK (scope IN ('msp','company','user')),
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (scope, company_id, setting_key)
) STRICT;

INSERT INTO portal_settings_v2
  (setting_id,setting_key,setting_value_json,scope,company_id,updated_by_user_id,updated_at)
SELECT
  scope || ':' || COALESCE(company_id,'global') || ':' || setting_key,
  setting_key,setting_value_json,scope,company_id,updated_by_user_id,updated_at
FROM portal_settings;

DROP TABLE portal_settings;
ALTER TABLE portal_settings_v2 RENAME TO portal_settings;

CREATE INDEX portal_settings_company_scope_key
  ON portal_settings(company_id,scope,setting_key);
