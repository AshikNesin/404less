---
name: verify-404less
description: "Drive the real 404less app (Cloudflare Workers + D1 broken-link monitor, groot monorepo) the way a user does: launch an isolated Node dev instance on a private port with a throwaway SQLite DB, sign in through the magic-link flow, create a site, fire visitor 404s through the real embed script, run crawls, triage links, and use API keys / MCP. Reach for this whenever a change to 404less needs behavioral proof (before/after a fix, a refactor's blast radius, 'does the app still work'), or when preparing evidence (screenshots, curl transcripts, DB rows) that a feature works end to end."
---

# Verify 404less

The app: a monorepo (pnpm) — Worker/Node server in `apps/web/src/server`, React SPA in `apps/web/src/client`, marketing site in `site/`, worker integration tests in `tests/worker/`, browser E2E in `tests/e2e/`. Production is Cloudflare Workers (D1, DOs, per-minute crawl tick); local dev runs the same Hono app on Node with better-sqlite3 and in-process DO stand-ins.

Two surfaces to verify:

- **Dashboard SPA** under `/app` (React Router, TanStack Query) — sign-in, sites, links, crawl, channels, keys.
- **Public contract** (frozen, tested by `tests/worker/groot-migration.test.ts`): `GET /embed.js`, `POST /api/track`, `GET /api/suggestions` (paths + payloads + `Access-Control-Allow-Origin: *`), `POST /mcp`. Dashboard API lives under `/api/v1`.

## Non-negotiables

- **Never drive the developer's own `pnpm dev` instance or `data/dev.db`** — it shares state with their session. Always launch your own instance with the isolation below (own port + own DB file). The E2E webServer does exactly this with `data/e2e.db`; do the same with `.verify/verify.db`.
- Never write to `broken_links`, `not_found_events` or `known_urls` directly in SQL — go through `/api/track`, the sitemap import, or a crawl. Direct writes bypass the services' upserts and the known-URL cache (`knownIndex`, 5 min per isolate), so suggestions will lie to you.
- `wrangler dev` reads `wrangler.jsonc` which pins a **real production `database_id`**; with `--persist-to` local state is separate, but prefer the Node instance (next section) for verification — it boots faster and has no queue/cron drift.
- pnpm only. Don't call `vp` directly (`pnpm check`, `pnpm test`).

## Launch (isolated Node instance)

```bash
pnpm install                                  # once; skip if node_modules exists
mkdir -p .verify
printf 'PORT=3777\nDATABASE_URL=file:./.verify/verify.db\nLOG_LEVEL=warn\n' > .verify/verify.env
set -a; . ./.verify/verify.env; set +a
DATABASE_URL=file:./.verify/verify.db pnpm exec tsx scripts/seed.ts   # migrations; no seeded user needed
tmux kill-session -t v404 2>/dev/null
tmux new-session -d -s v404 'set -a; . ./.verify/verify.env; set +a; PORTLESS=0 pnpm exec tsx apps/web/src/server/entry.node.ts 2>&1'
# ready when /health is 200 (≈6 s); the server also logs "Server is running on http://localhost:3777"
for i in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:3777/health && break; sleep 1; done
```

Pick a port nothing else owns (`ss -tlnp | grep 3777` must be empty; 3777 chosen to miss wrangler's 8787/8788). `PORTLESS=0` avoids the portless HTTPS proxy. On loopback without `RESEND_API_KEY`, the magic link is returned in the response (dev mode) — sign-in needs no email.

## Doctor (run this first whenever anything looks off)

```bash
curl -sf http://127.0.0.1:3777/health && echo OK          # instance answers
curl -sf http://127.0.0.1:3777/app -o /dev/null           # SPA shell serves
curl -s http://127.0.0.1:3777/api/v1/me | head -c 40      # → {"error":"unauthorized"} (auth guarded)
git log --oneline -1                                       # which commit is under test
sqlite3 .verify/verify.db 'SELECT COUNT(*) FROM users;'   # 0+ (your own DB, not the dev one)
```

A 401 from `/api/v1/me` is healthy (it proves the guard). If `/health` fails: `tmux capture-pane -pt v404 | tail -30`.

## Drive

**Sign in (curl path, no browser needed):**

```bash
LINK=$(curl -s -X POST http://127.0.0.1:3777/api/v1/auth/magic -H 'Content-Type: application/json' \
  -d '{"email":"verify@404less.test"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["devLink"])')
curl -s -o /dev/null -c .verify/cookies.txt "$LINK"        # 302 → session cookie f404_session
COOKIE="Cookie: $(grep f404_session .verify/cookies.txt | awk '{print "f404_session="$7}')"
curl -s http://127.0.0.1:3777/api/v1/me -H "$COOKIE"       # user + teams
```

**Create a site + fire a visitor 404 (the core loop):**

```bash
SITE=$(curl -s -X POST http://127.0.0.1:3777/api/v1/sites -H "$COOKIE" -H 'Content-Type: application/json' \
  -d '{"name":"Verify","domain":"127.0.0.1:8799"}' | python3 -c 'import sys,json;s=json.load(sys.stdin)["site"];print(s["id"]+" "+s["site_key"])')
set -- $SITE; SITE_ID=$1; SITE_KEY=$2
curl -s -X POST http://127.0.0.1:3777/api/track -H 'Content-Type: application/json' \
  -d "{\"siteKey\":\"$SITE_KEY\",\"url\":\"http://127.0.0.1:8799/docs/getting-startd\",\"referrer\":\"https://google.com/\"}"
curl -s "http://127.0.0.1:3777/api/v1/sites/$SITE_ID/links?status=open" -H "$COOKIE"   # the hit, open, source visitor
```

**Customer-site fixture** (`busybox httpd` on :8799, pages + sitemap + a 404 page that loads the real embed inline): see `Helpers` below — `.verify/fixtures.sh` builds it. The 404 page must set `data-404` (or a "not found" title) and live at the _typo_ URL whose suggestions you're checking (the widget hides in toast mode when nothing scores ≥ 0.2; a page called `404-page.html` scores 0 against `/docs/...`).

**Crawl:** `curl -X POST .../api/v1/sites/$SITE_ID/crawl -H "$COOKIE"` then poll `.../crawl-report` — the first tick runs inline in the request's `waitUntil`, results land in seconds (Node's timer re-ticks every 30 s). Assertions: broken rows carry `found_on` (the page linking them) + anchor text; working pages 200; known_urls grows (crawl source).

**Triage:** `PATCH .../api/v1/sites/$SITE_ID/links -d '{"ids":["<id>"],"status":"ignored|resolved|open"}'` → counts move; a fresh visitor hit on a resolved URL reopens it.

**MCP / API keys:** create a key `POST /api/v1/teams/$TEAM/keys`, then `POST /mcp` with `Authorization: Bearer 404l_…` (initialize → tools/list → tools/call). The same bearer now works on `/api/v1/*` (acts as the key's team owner).

**Browser (dashboard UI):** use the browser tool against `http://127.0.0.1:3777`. Stable handles: `getByLabel("Email")` on login, `Send sign-in link` button (dev link is followed automatically by the SPA), sidebar `navigation[name="Main navigation"]` with links Overview / Broken links / Crawler / Site settings, `aria-label="Search URLs or link text"`, `aria-label="Sitemap URL"`, `Crawl now` button, role=toolbar bulk actions Resolve/Ignore. For full reference specs of every journey, read `tests/e2e/*.spec.ts` — they drive the same UI and are the source of truth for selectors.

## Evidence

Proofs go in `.verify/evidence/` (git-ignored, survives cleanup):

- curl transcripts: pipe through `python3 -m json.tool`, save the request+response pair.
- DB state: `sqlite3 .verify/verify.db 'SELECT url,status,source,hits FROM broken_links'`.
- Screenshots from the browser tool (dashboard states, the widget rendered on the fixture 404 page).
- A proof must show **action → state**: the `/api/track` response _and_ the resulting open row; the crawl request _and_ `found_on` on the broken row; the PATCH _and_ the moved counts. Cross-check the widget's own fetches: `window.__404less.suggest()` resolves with the ranked list.

Never mock inside the app's own boundaries: the fixture HTTP server is the customer's site (a real outbound boundary), everything else is the real stack.

## Cleanup

```bash
tmux kill-session -t v404 2>/dev/null
pkill -f 'busybox httpd -f -p 8799' 2>/dev/null    # only the fixture you started (check the port)
rm -rf .verify/verify.db .verify/customer .verify/cookies.txt .verify/verify.env .verify/ids.env
# keep .verify/evidence — it is the proof
```

Kill only what you started: the tmux session `v404` and the 8799 fixture. Never kill wrangler/workerd processes by name — the developer's instances look identical.

## Helpers

- `.verify/fixtures.sh customer <site_key>` — builds `.verify/customer/` (index, docs/getting-started, sitemap.xml, a `docs/getting-startd` typo page carrying the inline embed pointing at :3777) and serves it on 127.0.0.1:8799. Substitution site key + port happen at build time; re-run after recreating a site.
- Worker tests (no launch needed): `pnpm test:worker` — 125+ integration tests in workerd via `SELF.fetch()`, the fastest full-stack signal.
- Headless E2E (no X server needed — the base config is headed for macOS): `pnpm exec playwright test --config playwright.headless.config.ts`. It manages its own server on :3000 with `data/e2e.db`; never run it while your :3777 fixture uses :8799 — it starts its own customer-site servers on random ports, but the app port must be free.

## Gotchas learned the hard way

- **Port collisions with the developer's instances**: this VM often has wrangler dev on 8787/8788/8790. Doctor the port before launch; a "200" from the wrong instance silently verifies someone else's build (it happened — verified the wrong instance for several minutes).
- The suggestions index caches per isolate for 5 min: seed known URLs (sitemap import) _before_ the first `/api/suggestions` call, or restart the instance and expect the cache to be warm.
- `?limit=` params are clamped on some routes but not all (NaN → 500 on known-urls); if you fuzz query params, check `sites.routes.ts` first.
- Magic-link `devLink` echoes the request origin — on wrangler dev with custom-domain routes configured, it can come back as `http://404less.com/...` (production!). Rewrite the origin to your instance before curling it. The Node instance echoes 127.0.0.1 correctly.
- The crawl tick on Node re-ticks every 30 s with a small budget; a "Crawl now" runs the first slice inline, but a large site's full run needs polling (each poll triggers a tick via waitUntil).
- Deleting a website row directly violates FK from broken_links/not_found_events etc. — delete via `DELETE /api/v1/sites/:id` or the whole graph in SQL.
