# 404less — High-Level Tech Design Doc

**Version:** 0.1 (draft) · **Date:** Oct 2026 · **Status:** For review — no code yet

> A self-hostable broken-link monitoring platform built entirely on Cloudflare's free tier,
> deployable by anyone in one click via Deploy to Cloudflare.

---

## 1. TL;DR

404less monitors websites for broken links in two modes:

- **Realtime (Phase 1):** a tiny embed script catches 404s as visitors hit them, records them, shows
  visitors suggested "did you mean?" links, and notifies the admin (Slack / Pushover / email).
- **Crawler (Phase 2):** a scheduled crawler scans the whole site (all links + assets), finds broken
  ones, notifies, and shows them in a dashboard with suggested fixes.

The entire backend runs on a single Cloudflare **Worker** + **D1** (SQLite) + **Queues** + **Cron
  Triggers**, all of which are on the Workers **Free** plan as of 2026. Anyone can self-host in one
  click with zero infrastructure cost.

## 2. Goals & Non-Goals

### Goals

1. Ship Phase 1 (realtime tracking + embed + notifications) fast — target ~1 week of dev.
2. **100% Cloudflare free-plan** components; a self-hoster pays $0 at hobby scale.
3. **One-click deploy** via the "Deploy to Cloudflare" button (wrangler.toml + resources declared as
   code). No manual D1/Queue creation.
4. Multi-tenant from day one: **Users → Teams → Websites** (Umami-style), API-key scoped.
5. Keep it boring and simple: SQLite, one Worker, no Kubernetes, no Redis.

### Non-Goals (for v1)

- **MCP server / automated fixing — explicitly invalidated by the feature research** (zero user
  demand, trust issues, MCP too new). If ever revisited, "assisted fixing" with mandatory user
  approval only.
- Uptime monitoring, SSL checks, keyword ranking (Oh Dear territory — bloat).
- Billing/Stripe. v1 is free/self-hosted; SaaS monetization is a separate decision.
- iOS/Android apps. Dashboard is a responsive web app.

## 3. Product Recap (from PRD)

### Phase 1 — Realtime monitoring
1. 404 hit by a visitor → tracked in DB (URL, referrer, timestamp, UA).
2. End user on the 404 page sees related/suggested links (the embed's smart 404 widget).
3. Site admin notified via Slack, Pushover, and/or email, with digesting to avoid alert fatigue.
4. Embeddable `<script>` snippet — no-code install, auto-infers the current site, supports teams/tenancy.

### Phase 2 — Crawler
1. Crawl all links on a site on a schedule.
2. Validate each link (status code, redirects).
3. Broken ones → tracked + admin notified.
4. Dashboard: all broken links per site with **suggested fixes** (levenshtein/keyword match against
   known-good URLs; redirect-chain visualization).

## 4. Architecture Overview

```
                        ┌───────────────────────────────────────────┐
                        │              Cloudflare (free)             │
                        │                                           │
  Browser (visitor) ──▶ │  Worker A: ingest API  (/api/track)        │
   404 page + embed      │   ├─ validates site key, Origin/Referer   │
                        │   ├─ writes event batch to D1             │
                        │   └─ enqueues notification job → Queue     │
                        │                                           │
  Admin browser ──────▶ │  Worker A: dashboard (SSR/SPA) + REST API  │
                        │   ├─ auth via magic-link sessions (DO)     │
                        │   └─ CRUD sites/teams/users, view reports  │
                        │                                           │
                        │  Worker B: crawler (Cron Trigger)          │
                        │   ├─ enqueues crawl tasks → Queue          │
                        │   └─ consumer fetches URLs, records status │
                        │                                           │
                        │  Worker C: notifier (Queue consumer)       │
                        │   ├─ Slack webhook / Pushover / email API  │
                        │   └─ rate-limit + digest via Durable Object│
                        │                                           │
                        │  D1 (SQLite)  Queues  DO(Sqlite)  Cron     │
                        └───────────────────────────────────────────┘
```

All three Workers can live in the same repo/deployment (one Worker with distinct entry handlers is
also fine — we'll keep 3 separate Workers for clean per-worker limits & deploys).

## 5. Component Design

### 5.1 Ingest & Embed (Phase 1 core)

- **Embed script:** `https://<host>/embed.js` served by the ingest Worker (long cache headers).
  Snippet:
  ```html
  <script src="https://404less.example.com/embed.js" data-site="<SITE_KEY>" defer></script>
  ```
- On load, if the page looks like a 404 (configurable heuristic: `document.status` unknown in browser,
  so we use `data-404="true"` attr, or the site's 404 template calls `window._404less('track')`, or
  the embed probes `fetch(location, {method:'HEAD'})` as fallback), it:
  1. Sends `POST /api/track` with `{siteKey, url, referrer, ua, ts}` (beacon API for reliability).
  2. Fetches `GET /api/suggestions?url=…` and renders a themed "Related pages" widget.
- **Tenancy:** the `siteKey` maps to a Website row (team-owned). Referer/Origin checked against
  registered domains; mismatches dropped (spam control).
- **Event write path:** single D1 insert (batched per request via `prepare` — one statement, cheap).
  Keep writes under the 100k rows/day free limit via per-site rate limiting (KV or DO counter).
- **Filtering/exclusions (retention-critical, RICE 203):** every site gets per-site config for
  ignored status codes (403/405/406…) and URL-pattern exclusions, applied at both ingest and
  crawl stages. False positives are the #1 churn driver per the research — in scope for Phase 1.

### 5.2 Suggestions engine

- v1: on a 404 event, query D1 for URLs on the same site crawled/indexed (Phase 2 index, or sitemap
  import) with the smallest Levenshtein distance + token overlap to the broken path. Top 3 returned.
- Until the crawler ships, support **sitemap.xml import** (dashboard action) so Phase 1 alone can
  produce suggestions.

### 5.3 Notifications

- Queue consumer Worker receives `{siteId, type, payload}`.
- Channels: Slack incoming webhook, Pushover REST call, email via **Resend** (free 3k/mo;
  `RESEND_API_KEY` + optional `MAIL_FROM`) behind a single adapter interface. Without the key,
  the app runs in dev mode: magic links return in the API response instead of emailing.
- **Digestion:** a Durable Object per site (`DO:[siteId]:alerts`) groups events in a window (default
  15 min) and sends one summary — prevents the classic alert-flood from a single bad deploy.
- Per-user notification preferences + per-channel enable flags (matches your notification-toggle rule).

### 5.4 Crawler (Phase 2)

- Cron Trigger schedules per-site scans (daily default; site-configurable).
- Crawler enqueues `{siteId, url}` messages to a Queue; consumer fetches each URL, records status,
  follows one level of redirects to capture chains, parses HTML (linkedom — Workers-compatible) for
  more URLs up to a per-site budget (e.g. 5k pages free-tier friendly).
- Politeness: per-domain delay via consumer concurrency=1 per site; robots.txt respected.
- Broken/redirect-chain results written to `link_checks`; diffed against previous run to only notify
  on **new** failures.

### 5.5 Auth

- Magic link: dashboard posts email → Worker creates token in D1 (TTL 15 min) → emails link → click
  sets a session cookie backed by a Durable Object session store. No passwords. (Simpler than full
  OAuth; matches the PRD.)
- API keys per team/site for programmatic access + future MCP server.

### 5.6 Remote MCP server (read-only)

Owner decision: include in current phase despite the research's low demand signal.

- **Protocol:** MCP Streamable HTTP — the Worker exposes `https://<host>/mcp` as a stateless
  streamable-HTTP endpoint (works with Claude Desktop/Code, Cursor, etc.; no long-lived transport).
- **Auth:** bearer API key per team (same key as the REST API) — HTTP-API-first, no OAuth for v1.
- **Tools exposed (v1, all read-only):**
  - `list_broken_links({site, status?, since?})` → broken URLs + source pages + last-seen
  - `get_suggestions({site, url})` → suggested fixes (same engine as widget/dashboard)
  - `list_sites()` → sites the key can access
  - `get_link_details({site, url})` → redirect chain, first/last seen, occurrences
- **Stance:** MCP surfaces data so the user's agent can open a PR; 404less never writes to the
  repo itself — respects the research's trust/auto-fix concern while still shipping the
  integration.
- Thin implementation: each tool is a JSON-schema wrapper over existing REST handlers; no new
  infrastructure.

### 5.7 Data Model (D1, SQLite)

```
users(id, email, created_at)
teams(id, name, owner_user_id, created_at)
-- quota: max 5 sites per team by default (env MAX_SITES_PER_TEAM, override for SaaS mode),
-- enforced on site create — protects self-hoster D1/queue daily limits
team_members(team_id, user_id, role)             -- owner|admin|viewer
websites(id, team_id, name, domain, site_key, sitemap_url, created_at)
not_found_events(id, website_id, url, referrer, user_agent, ts)   -- partition-friendly: keep 90d
link_checks(id, website_id, url, status, redirect_chain, checked_at)
known_urls(id, website_id, url, title, source)   -- source: crawl|sitemap
alerts(id, website_id, type, payload_json, status, sent_at)
alert_channels(id, team_id, type, config_json, enabled)
alert_prefs(user_id, channel_id, event_type, enabled)
sessions(token, user_id, expires_at)             -- in DO, mirrored if needed
magic_tokens(token, user_id, expires_at)
``n

Retention: nightly cron prunes `not_found_events` older than N days (site-configurable) to stay well
under D1's 500MB free cap.

## 6. Free-Plan Budget Check (self-hoster cost = $0)

| Resource | Free limit | Expected 404less usage at hobby scale |
|---|---|---|
| Worker requests | 100k/day | ingest + dashboard; ~thousands/day |
| D1 | 5M reads, 100k writes/day, 500MB | bounded by rate limiter + retention |
| Queues | 10k ops/day | 1 op per 404 event + crawl batches — fine |
| Durable Objects (SQLite) | 100k req/day, 100k writes/day | digest/session DOs — negligible |
| Cron Triggers | 3 per Worker (free plan) | crawler + retention + digest — fits in 3 |

Verified: Queues free-plan availability (Feb 2026 changelog) · DO SQLite free tier (Apr 2025) · D1
limits (docs). Links: see §10.

## 7. One-Click Deploy

- Repo ships `wrangler.toml` (or `wrangler.jsonc`) declaring D1, Queues, DO bindings, and cron — the
  **Deploy to Cloudflare** button provisions everything in the self-hoster's account.
- All config (Resend key, public URL) via dashboard onboarding wizard writing to KV/secrets.
- Stack: **TypeScript, Hono** (thin HTTP routes), feature services in `src/server/features/*`, D1 SQL.
  Dashboard: Vite + React + TanStack Router SPA (light theme, sidebar shell) served via Workers static
  assets — structure modeled on open-seo (github.com/every-app/open-seo): client features folders,
  ui component primitives, service-layer backend.
- Per your preference this stays pure HTTP-API-first (no CLI wrappers); the embed and MCP-facing
  endpoints are just REST.

## 8. API Surface (summary)

```
POST /api/track          {siteKey, url, referrer}          -- embed beacon
GET  /api/suggestions    ?site=…&url=…                     -- embed widget
POST /api/auth/magic     {email}
GET  /api/auth/verify    ?token=…
GET  /api/sites          (auth) list sites w/ broken counts
GET  /api/sites/:id/events, /link_checks, /suggestions
POST /api/sites/:id/import-sitemap
CRUD /api/teams, /api/sites, /api/channels, /api/prefs
```

## 9. Milestones

1. **M1 (2–3 d):** repo scaffold, D1 schema, magic-link auth, sites/teams CRUD, one-click deploy
   button working on a clean account.
2. **M2 (2 d):** embed.js + /track + suggestions (sitemap import) + widget rendering; per-site
   status-code filters & URL exclusions.
3. **M3 (1–2 d):** notifications (Slack/Pushover/email via **Resend** — confirmed choice) with DO
   digests + CSV export (RICE 153, cheap on top of the same queries).
4. **M3.5 (1 d):** Remote MCP server (read-only tools over the REST handlers, bearer API-key auth).
5. **M4 (Phase 1.5/2):** scheduled crawling via cron + queues, image/asset 404 detection, redirect
   chains, suggested fixes, historical trend charts.
6. **Later:** GitHub Action, webhooks for non-MCP automation, Search Console scoring.

## 10. References

- Queues on free plan: https://developers.cloudflare.com/changelog/post/2026-02-04-queues-free-plan/
- DO free tier: https://developers.cloudflare.com/changelog/post/2025-04-07-durable-objects-free-tier/
- DO pricing: https://developers.cloudflare.com/durable-objects/platform/pricing/
- D1 limits/pricing: https://developers.cloudflare.com/d1/platform/limits/ · …/pricing/
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- PRD & feature roadmap: your uploaded Claude chat + feature-research artifact (Phase 1/2 scope,
  RICE-ranked features: exclusions 203 > CSV 153 > scheduling 128 > assets 120 > redirect chains 99;
  MCP auto-fix invalidated)
