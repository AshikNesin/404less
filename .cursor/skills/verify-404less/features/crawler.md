# Crawler

## Sub-features

- Scheduled crawling (default every `CRAWL_INTERVAL_HOURS` = 24) + manual "Crawl now"; a run's frontier is `crawl_tasks` rows worked by a tick (every minute in production; inline slice + 30 s timer on the Node dev server).
- Checks every link and asset found (redirect chains recorded), respects robots.txt, caps at `crawl_max_pages` per run.
- Findings land in the same broken-links list with `source` crawler, carrying `found_on` (the linking page) and the anchor text.
- Re-verification: open links are rechecked each run; a link that works again auto-resolves. Visitor-reported open links are rechecked too.

## How to get to it (user POV)

Site → "Crawler" tab: Crawl now button, schedule + budget settings (pages per crawl, ignored status codes), latest results table (broken first, with found-on), known pages list.

## Driving it with curl

`POST /api/v1/sites/$SITE_ID/crawl -H "$COOKIE"` → `{"ok":true,"started":true}`; poll `GET .../crawl-report?limit=100` (first tick runs inline; seconds on the Node instance). Assert: the fixture's `/docs/missng-page` appears broken with `found_on` = the home page and its anchor text; `/docs/getting-started` is 200; the previously visitor-reported `/docs/getting-startd` row auto-resolves once the fixture serves it (or stays open while it 404s).

## Driving it in the browser

Crawler tab → `Crawl now` → rows appear by polling (30 s timeout in the e2e spec). See tests/e2e/crawler.spec.ts.

## Gotchas

- The crawl uses `siteOrigin`: `127.0.0.1` hosts are fetched over http — the fixture must serve plain http.
- robots.txt is fetched once per origin per ~5 min; a missing robots.txt allows all (4xx = no rules), so the fixture works with or without one.
- On the Node instance each dashboard poll of the crawl report triggers a tick via waitUntil — poll to advance a big run.
- Worker tests drive ticks directly (`tests/worker/crawl-helpers.ts` `startTestRun` + `tickUntilDone`) when you need deterministic, budget-free runs.
