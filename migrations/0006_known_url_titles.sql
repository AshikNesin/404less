-- M6: real page titles for known URLs. Sitemap imports store no title; a
-- background job (fetch-titles queue messages) reads each page's <title> once.
-- title_checked_at marks that attempt, found or not.
ALTER TABLE known_urls ADD COLUMN title_checked_at INTEGER;

-- Crawled rows already carry the real title; sitemap rows hold a guess from the
-- slug and get fetched.
UPDATE known_urls SET title_checked_at = added_at WHERE source = 'crawl';

-- Pages still waiting for a title (rows drop out of the index once fetched).
CREATE INDEX idx_known_urls_untitled ON known_urls(website_id) WHERE title_checked_at IS NULL;
-- A fetched title updates the stored suggestions that point at that page.
CREATE INDEX idx_broken_links_site_suggested ON broken_links(website_id, suggested_url);
