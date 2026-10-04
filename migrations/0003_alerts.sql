-- M3: notification channels, alert history, per-site notification settings.
CREATE TABLE alert_channels (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  type TEXT NOT NULL CHECK (type IN ('slack','pushover','email')),
  name TEXT NOT NULL DEFAULT '',
  config TEXT NOT NULL,             -- JSON per type: {url} | {token,user} | {to}
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  website_id TEXT NOT NULL REFERENCES websites(id),
  channel_id TEXT NOT NULL REFERENCES alert_channels(id),
  summary TEXT NOT NULL,
  sent_at INTEGER NOT NULL
);
CREATE INDEX idx_alerts_site_time ON alerts(website_id, sent_at DESC);

ALTER TABLE websites ADD COLUMN notify_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE websites ADD COLUMN digest_minutes INTEGER NOT NULL DEFAULT 15;
