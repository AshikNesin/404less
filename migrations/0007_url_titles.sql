-- M7: real page titles everywhere a URL is shown. broken_links.title is the
-- broken URL's own title (the page's title while it worked, from the live 404
-- title the embed sends, or the title the crawler saw); crawl_sources.source_title
-- is the title of the page the link was found on; not_found_events.title is the
-- title the visitor saw. Backfill from known_urls where a title already exists.
ALTER TABLE broken_links ADD COLUMN title TEXT;
ALTER TABLE crawl_sources ADD COLUMN source_title TEXT;
ALTER TABLE not_found_events ADD COLUMN title TEXT;

UPDATE broken_links SET title = (
  SELECT k.title FROM known_urls k
  WHERE k.website_id = broken_links.website_id AND k.url = broken_links.url AND k.title IS NOT NULL
);
UPDATE crawl_sources SET source_title = (
  SELECT k.title FROM known_urls k
  WHERE k.website_id = crawl_sources.website_id AND k.url = crawl_sources.source_url AND k.title IS NOT NULL
);
