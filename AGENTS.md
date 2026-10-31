# 404less: agent guide

404less is a child of the [groot](https://github.com/AshikNesin/groot)
boilerplate: `packages/*`, root configs, `scripts/`, `docs/` and `.groot/` are
synced from groot (`pnpm groot:sync`); 404less's own code lives in `apps/web/`,
`site/`, `tests/worker/` and `tests/server/app/`. Groot's guides start at
[`docs/README.md`](./docs/README.md); the product design doc is
[`docs/DESIGN.md`](./docs/DESIGN.md).

Use **pnpm** for everything. Don't call `vp` directly (use `pnpm check`,
`pnpm test`, `pnpm build:client`). No npm or yarn.

## Non-negotiable rules

- **Never edit synced files for app needs.** `packages/**`, `scripts/**`,
  `*.config.*`, `tsconfig*.json`, `.github/workflows/**`, `docs/**` (except
  `docs/DESIGN.md`, `docs/demo/`) come from groot. A real fix belongs in groot
  (`pnpm groot:upstream`); a 404less-only file goes in an app-owned path or in
  `.groot/boilerplate-sync.json` → `additional_exclusions`.
- **Packages never import from `apps/`.** Apps import packages, never the reverse.
- **The public widget contract is frozen.** `/embed.js`, `POST /api/track`,
  `GET /api/suggestions` (paths, payloads, `Access-Control-Allow-Origin: *`)
  and `/mcp` are baked into customer sites and MCP clients. They are mounted
  outside `/api/v1` in `app.ts` and pinned by `tests/worker/groot-migration.test.ts`.
  Everything the dashboard calls lives under `/api/v1`.
- **Migrations: Drizzle only, and 0001–0007 are history.** Edit
  `apps/web/src/server/db/schema.ts`, run `pnpm db:generate`, commit
  `apps/web/drizzle/`. Never rename, regenerate or edit an applied migration:
  production D1 records them by file name in `d1_migrations` (the files
  0001–0007 were written by hand before groot and applied by wrangler).
  Pending migrations apply on the Worker's first request (`worker/boot.ts`).
- **Don't re-export core's `users`/`passkeys` tables** from the app schema.
  404less has its own `users` (text ids, magic-link auth); drizzle-kit would
  try to rewrite it.
- **Auth is 404less's own:** magic link + HMAC session cookie
  (`lib/auth.ts`, `middlewares/session.middleware.ts`), secret auto-generated
  in `app_meta`. Core's JWT/password/passkey routes are not mounted.
  `GET /api/v1/auth/me` answers in groot's envelope for `@groot/shell`'s
  session store.
- **No database transactions.** D1 has none; group writes with `batch([...])` (`db/index.ts`).
- **Zero-config self-hosting.** The Deploy button must boot with no secrets:
  `worker/boot.ts` fills groot's production secrets from `app_meta` when unset.
  Sign-in needs `RESEND_API_KEY` on any public host; only a loopback host
  (`localhost`) may return the magic link in the response (`auth.routes.ts`).
- **A change to a managed surface needs a changeset** (`pnpm changeset`, or a
  reason under `.changeset/no-release/`); `pnpm check:changesets` enforces it.

## Runtime

Production is Cloudflare Workers only (`apps/web/src/server/entry.worker.ts`):
D1, the `CRAWLQ` queue (crawl fan-out; never move it onto groot's jobs
table, as it would eat the free-tier D1 write budget), Durable Objects
(`DigestDO` alert digests, `RateLimiterDO` ingest limits), Static Assets, and
two crons (crawl every 30 min, retention nightly). Routes and services receive
the bindings as `c.env`/`env`; database access is Drizzle's query builder on
groot's `db` (`import { db, batch, … } from "apps/web/src/server/db"`), never
`env.DB`, except where no app boot exists (Durable Objects, `worker/boot.ts`),
which wrap the binding with `drizzle()`. Use `batch()`/`batchAll()` instead of
`db.batch()` (better-sqlite3 has none) and `changes()` for affected-row counts.
D1 caps a statement at 100 bound parameters: batch single-row inserts rather
than one large multi-row insert. Schema keys are snake_case on purpose: rows
go to the client as-is, so the JSON keeps the column names.

`pnpm dev` runs the same app on Node with in-process stand-ins for the queue
and DOs (`node-bindings.ts`); `pnpm dev:worker` runs the real Worker locally.

## Principles

- Prefer simple, flat, readable code with minimal indirection.
- Thin Hono routes (`api/<feature>/<feature>.routes.ts`): parse/validate input,
  delegate to the feature service (`<feature>.service.ts`), map errors to status codes.
- Validate untrusted input at trust boundaries.
- Client code grouped by feature (`apps/web/src/client/features/<feature>/`);
  pages in `pages/`; primitives come from `@groot/ui` (`pnpm check:tokens`
  enforces the design-system rules, see `docs/features/dls.md`).
- TanStack Query for server state; React Router (basename `/app`); list filters
  live in the URL.
- Light theme only. Graphite is the only brand colour (primary buttons, active
  nav, toggles, the data series); semantic colours appear only when they mean
  state. Tokens: `apps/web/src/client/styles.css` over `@groot/shell/index.css`.
- URL layout: marketing site at `/` (static HTML from `site/`), dashboard
  under `/app` (SPA shell `app.html`, login at `/app/login`). The Worker's
  `worker/static-assets.ts` maps `/` and `/<page>` to `<page>.html`, `/app/*`
  to `app.html`, everything else to `404.html` with a 404 status
  (`html_handling: none`).
- Keep free-tier ceilings in mind: batch D1 writes, cap per-site data, prune
  old events, stay inside the per-request CPU budget.

## Domain model

- `broken_links` is the managed list: one row per (site, url) with `status`
  open|resolved|ignored and `source` visitor|crawler|both. Both detectors upsert
  through `api/links/links.service.ts` (`recordVisitorHit`, `recordCrawlResult`);
  never write the table from routes.
- Visitor hits reopen resolved rows; crawler success resolves open rows;
  ignored rows stay ignored and never alert.
- `not_found_events` is the raw visitor log (pruned nightly); `link_checks` is
  crawler history (30 days).
- `known_urls` (sitemap import + crawler) feeds suggestions. `title` is the
  page's real `<title>`: imports store none, and a `fetch-titles` queue job
  reads them a few pages per message (`title_checked_at` marks a finished
  attempt; `websites.title_job` keeps one job per site; the nightly cron
  resumes any backlog). The ranker drops a title 3+ pages share.

## Commands

- `pnpm dev:worker`: build SPA + site, run the Worker in workerd (:8787)
- `pnpm dev`: Node + Vite HMR (open `/app`)
- `pnpm build:client`: `vp build` then `site/build.mjs` (SPA → `dist/client/app.html`,
  marketing pages, sitemap, robots)
- `pnpm build:og`: re-render Open Graph images (Playwright; committed output)
- `pnpm test:worker`: 404less integration suites in workerd (the main safety net)
- `pnpm test` / `pnpm test:client`: groot's Node and client suites
- `pnpm typecheck` · `pnpm check` · `pnpm check:tokens` · `pnpm check:worker`
- `pnpm db:generate`: after a schema change
- `pnpm deploy:worker`: build + `wrangler deploy` (migrations apply on first request)
- `pnpm groot:check` / `pnpm groot:sync`: boilerplate updates
