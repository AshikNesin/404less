-- M5: broken_links — one row per (site, url) with a triage status. Both detectors
-- (visitor 404 hits via the embed, crawler link checks) upsert into it, so the
-- dashboard manages a single list instead of two raw logs.
CREATE TABLE broken_links (
  id TEXT PRIMARY KEY,
  website_id TEXT NOT NULL REFERENCES websites(id),
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',      -- open|resolved|ignored
  source TEXT NOT NULL DEFAULT 'visitor',   -- visitor|crawler|both
  hits INTEGER NOT NULL DEFAULT 0,          -- visitor 404 hits (all time)
  http_status INTEGER,                      -- last crawler status, NULL if never checked
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  resolved_at INTEGER,
  suggested_url TEXT,
  suggested_title TEXT
);--> statement-breakpoint
CREATE UNIQUE INDEX idx_broken_links_site_url ON broken_links(website_id, url);--> statement-breakpoint
CREATE INDEX idx_broken_links_site_status ON broken_links(website_id, status, last_seen DESC);--> statement-breakpoint

-- Backfill from visitor events.
INSERT INTO broken_links (id, website_id, url, status, source, hits, first_seen, last_seen)
SELECT lower(hex(randomblob(16))), website_id, url, 'open', 'visitor', COUNT(*), MIN(ts), MAX(ts)
FROM not_found_events GROUP BY website_id, url;--> statement-breakpoint

-- Backfill from the latest failing crawler check per url.
INSERT INTO broken_links (id, website_id, url, status, source, hits, http_status, first_seen, last_seen)
SELECT lower(hex(randomblob(16))), lc.website_id, lc.url, 'open', 'crawler', 0, lc.status, lc.checked_at, lc.checked_at
FROM link_checks lc
JOIN (SELECT website_id, url, MAX(checked_at) AS m FROM link_checks GROUP BY website_id, url) latest
  ON latest.website_id = lc.website_id AND latest.url = lc.url AND latest.m = lc.checked_at
WHERE lc.ok = 0
ON CONFLICT(website_id, url) DO UPDATE SET source = 'both', http_status = excluded.http_status;--> statement-breakpoint

-- Crawl bookkeeping + lookups the new views need.
ALTER TABLE websites ADD COLUMN last_crawl_at INTEGER;--> statement-breakpoint
CREATE INDEX idx_checks_site_time ON link_checks(website_id, checked_at DESC);--> statement-breakpoint
CREATE INDEX idx_crawl_sources_target ON crawl_sources(website_id, target_url);
