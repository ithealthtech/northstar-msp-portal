CREATE TABLE operational_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('backup','restore','retention','restore_verification')),
  status TEXT NOT NULL CHECK (status IN ('succeeded','failed')),
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json)),
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX operational_events_type_created ON operational_events(event_type,created_at DESC);
