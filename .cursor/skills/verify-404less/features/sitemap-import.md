# Sitemap import & known pages

## Sub-features

- `POST /api/v1/sites/:id/import-sitemap` with `{sitemapUrl}` (or defaults to the site's own `/sitemap.xml`): follows one sitemapindex level, caps at 5000 URLs, drops cross-host URLs, query strings and fragments; reports `{imported, inserted}`.
- Known URLs feed suggestions and seed the next crawl. Titles are not in sitemaps; the crawl tick backfills real `<title>`s a few pages per tick (`title_checked_at`), and a title 3+ pages share is dropped by the ranker.
- `GET /api/v1/sites/:id/known-urls?limit=&q=` lists + searches (URL or title) with stats.

## How to get to it (user POV)

Site → Crawler tab → "Import sitemap" button (pre-filled with the site's sitemap URL) → toast "Imported N URLs (M new)".

## Driving it with curl

`curl -X POST .../api/v1/sites/$SITE_ID/import-sitemap -H "$COOKIE" -d '{"sitemapUrl":"http://127.0.0.1:8799/sitemap.xml"}'` → `{"ok":true,"imported":2,"inserted":2}`. Then `/api/suggestions?site=$SITE_KEY&url=<typo url>` must rank the real page. Unreachable sitemap → 422 naming the URL.

## Gotchas

- The import filters to the site's host — the fixture sitemap must use the same host:port the site was created with (`127.0.0.1:8799`).
- After import, `refreshSuggestions` runs in waitUntil; suggestions are correct immediately, but allow a beat before asserting.
- The import response caps at 5000 silently in this build — the legacy "capped" warning (00840d0) was not ported; don't assert on it.
