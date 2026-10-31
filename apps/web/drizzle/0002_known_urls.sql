-- M2: known-good URLs (sitemap import now; crawler later) powering suggestions.
CREATE TABLE known_urls (
  id TEXT PRIMARY KEY,
  website_id TEXT NOT NULL REFERENCES websites(id),
  url TEXT NOT NULL,
  title TEXT,
  source TEXT NOT NULL DEFAULT 'sitemap', -- sitemap|crawl
  added_at INTEGER NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX idx_known_urls_site_url ON known_urls(website_id, url);
