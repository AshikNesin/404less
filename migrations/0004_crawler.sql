-- M4: crawler state, link checks, crawl runs.
CREATE TABLE link_checks (
  id TEXT PRIMARY KEY,
  website_id TEXT NOT NULL REFERENCES websites(id),
  url TEXT NOT NULL,
  status INTEGER NOT NULL,          -- final HTTP status
  ok INTEGER NOT NULL,              -- 1 = 2xx/3xx-ok
  redirect_chain TEXT,              -- JSON array of hops [{url,status}]
  checked_at INTEGER NOT NULL
);
CREATE INDEX idx_checks_site_url ON link_checks(website_id, url);

CREATE TABLE crawl_sources (
  website_id TEXT NOT NULL REFERENCES websites(id),
  source_url TEXT NOT NULL,         -- page where the link was found
  target_url TEXT NOT NULL,         -- the link itself
  anchor TEXT,
  PRIMARY KEY (website_id, source_url, target_url)
);

ALTER TABLE websites ADD COLUMN crawl_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE websites ADD COLUMN crawl_max_pages INTEGER NOT NULL DEFAULT 100;
