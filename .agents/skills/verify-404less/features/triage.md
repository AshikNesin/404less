# Broken-links triage

## Sub-features

- One managed list per site: `status` open|resolved|ignored, `source` visitor|crawler|both; counts per status drive the tabs.
- Bulk actions (toolbar after selecting rows): Resolve, Ignore; single-row from the detail page. `PATCH /api/v1/sites/:id/links {"ids":[…],"status":…}` → `{ok, changed}`.
- Reopen semantics: a visitor hit on a resolved URL reopens it; ignored rows stay ignored, still count hits, never alert.
- Search (URL or link text), filter by status/source, sort, pagination, CSV export of the current view (`links.csv?status=…&source=…`), exclusions honored on ingest.
- Link detail: referrers, hits over time, ranked suggested fixes, copy-paste redirect rule per platform.

## How to get to it (user POV)

Sidebar → "Broken links" (badge = open count) under a site.

## Driving it with curl

List: `GET /api/v1/sites/$SITE_ID/links?status=open&sort=hits&page=1` → `{links, counts}`. Capture an id, `PATCH` it to `ignored`, re-list: counts move and the row appears under `?status=ignored`. Fire `/api/track` on a resolved URL → status flips back to open with hits incremented.

## Driving it in the browser

Row checkbox (`aria-label="Select <url>"`), toolbar `[role=toolbar]` buttons Resolve/Ignore; tabs Open/Resolved/Ignored carry live counts; search is `aria-label="Search URLs or link text"`. See tests/e2e/broken-links.spec.ts.

## Gotchas

- `changed` counts rows actually updated; ids must belong to the site (0 changed otherwise, not an error).
- CSV export needs the session cookie (browser link) — with a bearer key use `/api/v1/sites/:id/links.csv`.
