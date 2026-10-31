-- 404less M1 schema: users, teams, sites, magic-link auth, 404 events.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);--> statement-breakpoint

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);--> statement-breakpoint

CREATE TABLE team_members (
  team_id TEXT NOT NULL REFERENCES teams(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'viewer', -- owner|admin|viewer
  PRIMARY KEY (team_id, user_id)
);--> statement-breakpoint

-- Quota: max 5 sites/team by default (env MAX_SITES_PER_TEAM), enforced in app code
-- to protect a self-hoster's free-tier D1/Queue daily limits.
CREATE TABLE websites (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  site_key TEXT NOT NULL UNIQUE,
  ignore_status_codes TEXT NOT NULL DEFAULT '[]',  -- JSON array e.g. [403,405]
  exclude_patterns TEXT NOT NULL DEFAULT '[]',    -- JSON array of glob-ish patterns
  created_at INTEGER NOT NULL
);--> statement-breakpoint

CREATE TABLE not_found_events (
  id TEXT PRIMARY KEY,
  website_id TEXT NOT NULL REFERENCES websites(id),
  url TEXT NOT NULL,
  referrer TEXT,
  user_agent TEXT,
  ts INTEGER NOT NULL
);--> statement-breakpoint
CREATE INDEX idx_events_site_time ON not_found_events(website_id, ts DESC);--> statement-breakpoint
CREATE INDEX idx_events_site_url ON not_found_events(website_id, url);--> statement-breakpoint

CREATE TABLE magic_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);--> statement-breakpoint

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  key_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  created_at INTEGER NOT NULL
);--> statement-breakpoint

CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
