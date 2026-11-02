# Visitor 404 tracking + the widget

## Sub-features

- `POST /api/track` (public, CORS `*`, `text/plain` body): records the hit (URL, referrer, UA, page title), upserts a `broken_links` row (source visitor), notifies the digest DO unless ignored.
- `GET /api/suggestions?site=<key>&url=<url>` (public): ranked replacements from `known_urls` (min score 0.2; title shown when stored).
- The embed script (`/embed.js`): detects a 404 page (data-404 attr > meta tags > title match), tracks, renders an inline or toast card with up to 5 ranked suggestions; `data-track=false` shows without recording. Public API on the page: `window.__404less.{track,suggest,render}`.
- Per-site rate limit 500/h via RateLimiterDO (`{"ok":true,"limited":true}` when over) and per-site exclusion patterns (ignored events answer `{"ok":true,"ignored":true}`).

## How to get to it (user POV)

The visitor never sees the dashboard: they hit a 404 page on the customer's site and get the "Looking for something?" card. The owner sees hits appear in near-realtime on the site overview.

## Driving it

1. Build the fixture: `bash .agents/skills/verify-404less/fixtures.sh customer <site_key>` (serves 127.0.0.1:8799).
2. Import its sitemap first (see sitemap-import.md) — suggestions need known URLs, and toast mode renders nothing when the list is empty.
3. Browser → `http://127.0.0.1:8799/docs/getting-startd`; assert `.f404less` exists, its shadow root shows "Looking for something?" and a link to `/docs/getting-started`.
4. Side effect: `GET /api/v1/sites/$SITE_ID/events` shows the URL; the links list shows it open with source visitor (or "both" once the crawler also found it).

## Gotchas

- The typo page must exist _at the typo URL_ (the fixture builds it); a generic `404-page.html` scores ~0 against `/docs/...` paths and the toast stays hidden by design.
- `knownIndex` caches per isolate for 5 min — known URLs must exist before the first suggestions call, or restart the instance.
- The widget hides when dismissed for the session (sessionStorage) — use a fresh context or clear it.
