# 404less

Broken links, found and fixed before your visitors give up. Self-hostable on
Cloudflare's free tier.

<p align="center">
  <a href="docs/demo/404less-demo.mp4"><img src="docs/demo/poster.jpg" alt="Watch the 404less demo video" width="100%"></a>
</p>
<p align="center"><sub><b><a href="docs/demo/404less-demo.mp4">▶ Watch the demo</a></b> · 65 seconds, with sound · rendered from the real app by <a href="docs/demo">docs/demo</a></sub></p>

- **Realtime 404 tracking** — one script tag on your 404 page reports every hit
  (URL, referrer) and shows the visitor a "Looking for something?" card with the
  closest matching pages.
- **Scheduled crawler** — fetches your pages, checks every link and asset,
  records redirect chains, respects robots.txt, and re-verifies open broken links
  so they resolve on their own once fixed.
- **One list to manage** — every finding lands in a single broken-links list with
  open / resolved / ignored states, bulk actions, search, CSV export, suggested
  replacements and a copy-paste redirect rule for your platform.
- **Digests, not noise** — Slack, Pushover or email; one grouped digest per
  window per site. Ignored links never alert.
- **MCP for your agent** — read-only tools (`list_sites`, `list_broken_links`,
  `get_link_details`, `get_suggestions`) over streamable HTTP so Claude Code or
  Cursor can open the fix PR. 404less never writes to your repo.

## Screenshots

<p align="center">
  <a href="site/assets/img/overview.webp"><img src="site/assets/img/overview.webp" width="49%" alt="Overview: open broken links, 404 hits per day, and the links that need attention"></a>
  <a href="site/assets/img/links-sel2.webp"><img src="site/assets/img/links-sel2.webp" width="49%" alt="Broken links list with bulk actions and suggested fixes"></a>
</p>
<p align="center">
  <a href="site/assets/img/detail-vercel.webp"><img src="site/assets/img/detail-vercel.webp" width="49%" alt="Link detail: ranked suggested fixes, referrers, and a copy-paste redirect rule"></a>
  <a href="site/assets/img/crawl-results.webp"><img src="site/assets/img/crawl-results.webp" width="49%" alt="Crawler results with status, found-on page and redirect chains"></a>
</p>
<p align="center">
  <a href="site/assets/img/widget.webp"><img src="site/assets/img/widget.webp" width="60%" alt="The visitor widget: “Looking for something?” with the three closest matching pages"></a>
</p>
<p align="center"><sub>Overview · Broken links · Link detail with redirect rule · Crawler results · The widget visitors see on your 404 page</sub></p>

Stack: Cloudflare Workers + D1 + Queues + Durable Objects, Hono, Drizzle, TypeScript;
React 19 + React Router + TanStack Query SPA served as Worker static assets.
Built on the [groot](https://github.com/AshikNesin/groot) boilerplate (pnpm
workspace: synced `packages/*`, app code in `apps/web`). Design doc:
[docs/DESIGN.md](docs/DESIGN.md).

One Worker serves everything: the marketing site at `/` (`/embed`, `/self-host`,
`/agent`), the dashboard under `/app` (sign-in at `/app/login`), the dashboard API
under `/api/v1`, the snippet at `/embed.js` (with its endpoints `/api/track` and
`/api/suggestions`) and MCP at `/mcp`.

## Quick start (local)

Requires Node 24 and pnpm (`corepack enable`).

```bash
pnpm install
pnpm dev:worker        # builds the SPA + marketing site, runs the Worker (workerd, local D1 + Queues) on :8787
```

Open http://127.0.0.1:8787 (site) or http://127.0.0.1:8787/app (dashboard).
Migrations apply on the first request. Without `RESEND_API_KEY` a local
server (`localhost`) returns the magic sign-in link directly, so no email setup
is needed for development.

For UI work, `pnpm dev` runs the app on Node with Vite HMR (SQLite in
`data/dev.db`; the crawl queue runs in-process, alerts are logged instead of
sent) — open `/app`. It runs through `portless` (`npm i -g portless`), as in groot.

```bash
pnpm test:worker       # 404less's integration suite inside workerd + local D1 — no Cloudflare account needed
pnpm test              # groot's Node suites + the Node runtime check (in-memory SQLite)
pnpm test:client       # client component tests
pnpm typecheck         # server + client
pnpm check             # lint + format
pnpm build:og          # re-render the Open Graph images (needs Playwright; output is committed)
```

## Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/AshikNesin/404less)

Manual:

```bash
pnpm exec wrangler d1 create 404less          # paste database_id into wrangler.jsonc
pnpm deploy:worker                             # build SPA + site, deploy (migrations apply on the first request)
pnpm exec wrangler secret put RESEND_API_KEY   # required: email sign-in links (+ email digests)
pnpm exec wrangler secret put MAIL_FROM        # optional, e.g. "404less <no-reply@yourdomain>"
```

`RESEND_API_KEY` is the one secret a public deployment needs: without it,
sign-in on a non-local host answers 503 rather than handing sign-in links to
whoever asks. The session secret (and the keys groot's production checks ask
for) are generated on first boot and kept in D1.

Optional vars (`wrangler.jsonc` → `vars`): `MAX_SITES_PER_TEAM` (default 5),
`EVENT_RETENTION_DAYS` (default 90). Crons: crawler every 30 min, retention
nightly. Everything fits the Workers Free plan at hobby scale.

## Install the snippet

```html
<script src="https://your-404less.example/embed.js" data-site="SITE_KEY" defer></script>
```

Add it to your 404 template. The script detects a 404 page from the title, a
`data-404` attribute on `<html>`/`<body>`, a `prerender-status-code` meta tag, or
`data-404="true"` on the script tag itself. Options via `data-` attributes:

| attribute                 | values                                                         | default         |
| ------------------------- | -------------------------------------------------------------- | --------------- |
| `data-mode`               | `toast` (floating card) · `inline` (render into `data-target`) | `toast`         |
| `data-target`             | CSS selector for inline mode                                   | script's parent |
| `data-theme`              | `auto` · `light` · `dark`                                      | `auto`          |
| `data-accent`             | any CSS color                                                  | indigo          |
| `data-title`, `data-text` | heading / intro copy                                           | —               |
| `data-position`           | `right` · `left` · `center` (desktop toast)                    | `right`         |
| `data-max`                | 1–5 suggestions                                                | 3               |
| `data-track`              | `false` to only show suggestions                               | `true`          |
| `data-branding`           | `false` to hide "Powered by 404less"                           | `true`          |

Styling hooks: `.f404less { --f404-accent; --f404-bg; --f404-fg; --f404-muted; --f404-border; --f404-radius }`.
Site settings → "Preview the widget" opens `/embed-preview.html` with your key.

## API & MCP

Create a key under **API & MCP**, then:

```bash
claude mcp add --transport http 404less https://your-404less.example/mcp \
  --header "Authorization: Bearer 404l_…"
```

The key authenticates MCP; the dashboard API under `/api/v1` uses the signed-in
session cookie — see `apps/web/src/server/api/*/*.routes.ts`.

## Layout

```
apps/web/
  src/server/              Hono app (app.ts) on @groot/core
    entry.worker.ts        Worker entry: fetch, cron + queue handlers, DO exports
    worker/                boot (migrations, groot bootstrap), cron/queue wrappers, static-assets routing
    api/<feature>/         routes + services: auth (magic link), sites, links (triage model), crawl,
                           channels, keys, sitemap, ingest (widget), mcp, embed, events
    lib/                   session auth, mailer, notify, suggest (ranking), sitemap parsing
    do/                    Durable Objects: per-site alert digest, ingest rate limiter
    db/                    Drizzle schema, cross-driver batch helpers, Node SQLite
    entry.node.ts          Node dev entry (pnpm dev) with in-process binding stand-ins
  src/client/              React SPA (served for /app and /app/*): pages, features, components
  drizzle/                 SQL migrations (0001–0007 predate groot; never rename them)
packages/                  groot boilerplate (core, ui, shell, jobs, ai) — synced with `pnpm groot:sync`
site/
  pages/*.html             marketing pages (index, embed, self-host, agent, 404) + layout.html
  build.mjs                renders pages into dist/client, copies the demo video, writes sitemap.xml + robots.txt
  og/                      Open Graph image template + renderer → site/assets/og/*.png
tests/worker/              404less's integration suites, inside workerd via SELF.fetch()
tests/server/              groot's Node suites (synced) + tests/server/app (404less on Node)
```
