# 404less → groot boilerplate onboarding plan

Deep audit of this repo against the groot boilerplate (`~/Code/groot`, currently
v3.x @ `a4b4a76`), with a phased migration plan and blockers. Reference child
project used for patterns: `~/Code/tiny-agents` (synced at v3.0.0).

---

## 1. What "the groot approach" means here

groot is a pnpm-workspace boilerplate split into **synced boilerplate**
(`packages/core`, `packages/jobs`, `packages/ui`, `packages/shell`, `packages/ai`

- root configs + `.groot/` tooling) and **app-owned code** (`apps/web/**`).
  `pnpm groot:sync` 3-way merges boilerplate updates into child repos forever
  after; `pnpm groot:upstream` pushes fixes back. The dependency rule is one-way:
  apps import packages, never the reverse.

Onboarding is a **one-time manual restructure**: the sync tool reconciles
files, it does not convert a foreign layout (the old `migrate-layout.ts` was
for pre-2.0 groot projects and no longer exists). After the restructure,
`.groot/boilerplate-sync.json` pins the baseline and syncs stay clean.

## 2. Audit: where 404less stands today

| Area                 | 404less today                                                                                                                                           | groot target                                                                                                                  | Gap                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Layout               | flat `src/` + separate `web/` npm package + `site/` marketing builder                                                                                   | pnpm workspace `packages/*` (synced) + `apps/web` (owned)                                                                     | full restructure                                                        |
| Package mgr          | npm (`package-lock.json`) **and** a stray root `pnpm-lock.yaml`, plus `web/package-lock.json`                                                           | pnpm only, workspace catalog                                                                                                  | cleanup + conversion                                                    |
| Server framework     | Hono 4, hand-rolled route files, `c.env.DB.prepare` raw SQL                                                                                             | Hono 4 via `createApp()` (core): request ctx, CORS, body limit, error envelope, `parseBody`/Zod helpers                       | port routes onto core app factory                                       |
| DB access            | D1 raw SQL; `src/db/schema.ts` is a typed mirror only                                                                                                   | Drizzle query builder via `db` handle from `@groot/core/database` (D1 on Workers, better-sqlite3 on Node)                     | rewrite all queries                                                     |
| Migrations           | hand-written `migrations/000x_*.sql`, applied by `wrangler d1 migrations apply`                                                                         | drizzle-kit generated SQL in `apps/web/drizzle/`, auto-applied by `migrateD1()` on first request (same `d1_migrations` table) | baseline + continuity (see B2)                                          |
| Auth                 | magic-link email (Resend) + HMAC cookie, secret auto-generated in `app_meta` (zero-config)                                                              | core: JWT (jose) cookie/bearer + passkeys, `JWT_SECRET_KEY` secret                                                            | keep magic-link flow, issue core JWTs (see D1/B4)                       |
| Background work      | Cloudflare Queues (`CRAWLQ`) for crawl fan-out; 2 cron triggers; `DigestDO`, `RateLimiterDO`                                                            | `jobs` table + 1-min cron tick + dashboard UI                                                                                 | keep Queues for crawl (B9); optionally jobs for retention/titles/digest |
| Client               | React 19 + **TanStack Router** (file routes) + TanStack Query + hand-rolled ui kit, `web/app.html` → `dist/web`                                         | React 19 + **React Router 7** + TanStack Query + Zustand + `@groot/shell`/`@groot/ui`, `apps/web/index.html` → `dist/client`  | router + UI kit + theme migration                                       |
| API shape            | ad-hoc JSON (`{error}` / bare payloads), paths `/api/*`                                                                                                 | `{success, data}` envelope, paths `/api/v1/*`                                                                                 | dashboard/auth move to `/api/v1` (D2); widget paths frozen (B1)         |
| Tests                | 12 files / ~1,650 lines, `@cloudflare/vitest-plugin` in workerd, `SELF.fetch()`, real local D1                                                          | Node vitest vs `startWebApp()` + in-memory SQLite (`vitest.config.server.ts`, synced)                                         | port suite (B3)                                                         |
| Build/deploy         | `vite build` (web) + `site/build.mjs` → `dist/web`; wrangler assets w/ `html_handling: none` + custom catch-all; Deploy-to-Cloudflare button (`npm ci`) | vite-plus (`vp`) → `dist/client`; assets + `run_worker_first`; `pnpm`/corepack in CI                                          | toolchain swap, keep marketing-site builder as app-owned step (B7/B8)   |
| Workers-only surface | Queues, 2 DOs, ASSETS catch-all (marketing pages + SPA + real-404 status), `/embed.js`, `/mcp`                                                          | core is runtime-neutral; Workers wiring lives in `entry.worker.ts` (app-owned)                                                | fine: wiring is app-owned; Node parity is partial (B3)                  |

Positives that make this tractable: the service-layer split (`src/server/features/*`)
already matches groot's `api/<feature>/*.service.ts` shape; Hono version matches;
TanStack Query is kept by groot; D1 == SQLite so the schema ports 1:1 to Drizzle;
`wrangler.jsonc` is immutable in sync (never overwritten), so all bindings stay
child-owned.

## 3. Target layout (move map)

```
packages/{core,jobs,ui,shell,ai}/     copied from groot @ pinned tag; synced
apps/web/
  index.html                          ← web/app.html
  src/client/                         ← web/src/**  (routes→pages, React Router 7)
    pages/ … features/ …
  src/server/
    app.ts                            createWebApp(): mounts public + protected routers
    config.ts, env.ts                 defineConfig() overrides; app env (Zod)
    entry.worker.ts                   ← src/index.ts + src/cron.ts (fetch/scheduled/queue)
    static-assets.ts                  ← the ASSETS catch-all (marketing pages, SPA, 404)
    db/{schema.ts,node.ts}            drizzle schema (app tables + core/jobs re-exports)
    api/auth/                         magic-link routes (issues core JWT)
    api/sites/  ← routes/api.ts + features/sites
    api/links/  ← routes/links.ts + features/links
    api/channels/ ← routes/channels.ts + lib/notify, lib/mailer
    api/keys/    ← routes/keys.ts + features/keys
    api/ingest/  ← routes/ingest.ts + lib/suggest  (public, CORS)
    api/mcp/     ← routes/mcp.ts + features/mcp    (public path /mcp, bearer)
    api/crawl/   ← features/crawl/* + routes/sitemap.ts import endpoint
    embed.ts     ← routes/embed.ts (+ embed_js.txt as Text rule)
    do/{digest,rate-limit}.ts         Durable Objects (app-owned, Workers-only)
  drizzle/                            legacy 0001–0007 (reformatted) + generated baselines
site/                                 unchanged (app-owned marketing builder)
tests/server/app/**                   ported integration tests (app-owned area)
```

`AGENTS.md` gets rewritten to the groot child conventions (tiny-agents' is the
template); the open-seo reference is dropped in favor of groot's docs.

## 4. Key decisions (recommendations)

- **D1 (Auth):** keep magic-link as an app-owned public router; on verify, mint
  a core JWT (`@groot/core` jwt utils) so `jwtAuthMiddleware` guards everything
  else. Do **not** mount core's password/passkey routers. One-time logout of
  existing sessions when the cookie changes (acceptable).
- **D2 (API surface):** follow groot's versioning schema. Dashboard and auth
  endpoints move to `/api/v1/*` during Phase 3 (`/api/v1/me`,
  `/api/v1/sites/…`, `/api/v1/auth/magic`, `/api/v1/auth/verify`, …). This is safe
  because the SPA is their only consumer and client + server ship in one
  deploy, so there is no compat window and no redirects; legacy `/api/*`
  dashboard routes simply disappear. Exempt and frozen forever: the external
  widget contract `/embed.js`, `/api/track`, `/api/suggestions` (exact path,
  payload, CORS; see B1) and `/mcp` (root path, configured in users' MCP
  clients). Response shapes stay as-is during the move; adopt the
  `{success,data}` envelope opportunistically per-endpoint afterwards
  (client + server in one commit).
- **D3: Crawl stays on Cloudflare Queues.** The jobs table is a D1-row-budget
  liability for crawl fan-out (see B9 math). Introduce a `CrawlQueue` seam
  interface: Workers adapter wraps `env.CRAWLQ`; the Node/test adapter runs
  messages inline. Services never touch bindings directly.
- **D4: DOs stay initially** (`DigestDO`, `RateLimiterDO` are app-owned,
  small, and fit the free tier). Re-evaluate digest-as-job after the jobs
  dashboard lands.
- **D5 (Jobs table adoption, optional phase):** nightly retention, title
  backlog resume, and (later) digest flush move to jobs + schedules for
  dashboard visibility. Cron list becomes `* * * * *` (tick) + existing two.
- **D6 (Runtime):** Workers-only in practice. Ship `entry.worker.ts` as the
  real entry; skip `entry.node.ts` (or a stub that boots the app minus
  crawl/digest). Keep all Workers-only code behind seams so Node tests run.
- **D7 (Theme):** port the graphite palette / light-only rules into the groot
  DLS token layer rather than re-skinning the product to groot's look.
- **D8 (Router): stay on React Router (recommended; confirm).** Do not
  migrate groot to TanStack Router, and do not keep TanStack locally in
  404less. The kit is router-coupled (`@groot/shell` Layout/SidebarNav/
  CommandPalette/ProtectedRoute/Login, `@groot/jobs/client` table + detail),
  and each child's app-owned `App.tsx` is unsynced, so a groot router swap breaks
  every child in lockstep (a boilerplate major-version event) for a modest DX
  gain at 13 routes. Keeping TanStack only in 404less means exclusions on the
  shell/jobs surfaces and losing their syncs: the outcome that defeats the
  onboarding. Port compensation: `validateSearch` → **nuqs** (already in
  groot), `beforeLoad` guard → `ProtectedRoute` + auth store, file-route code
  splitting → `React.lazy` if it ever matters, `preload: 'intent'` → hover
  prefetch or `staleTime`. If TanStack is ever wanted family-wide: evolve
  groot first (major changeset), sync out, port children one by one, never
  inside an onboarding.

## 5. Phased plan

Sizes are focused-day estimates. Do this on a long-lived `groot` branch; the
intermediate states do not deploy, so merge when green (old entry keeps serving
prod until then).

### Phase 0: Safety & hygiene (0.5d)

1. Confirm `npm test`, `npm run typecheck`, `npm run build:web` green; tag `pre-groot`.
2. Lockfile cleanup: delete root `pnpm-lock.yaml` (stray) and `web/package-lock.json`; npm stays until Phase 1 flips to pnpm.
3. Pin the groot baseline tag/commit to onboard from (e.g. current `main` @ `a4b4a76` or the next release tag).

### Phase 1: Workspace scaffold (1–2d)

1. Restructure to the pnpm workspace: copy `packages/*`, root configs
   (`vite.config.ts`, `tsconfig*.json`, `pnpm-workspace.yaml`, `scripts/`,
   `.groot/`, `.github/`, `.env.example`, `components.json`, …) from the pinned
   groot checkout; run `pnpm groot:setup` for naming; set
   `.groot/boilerplate-sync.json.last_sync` to the pinned commit.
2. Move `src/**` → `apps/web/src/server/**` and `web/src/**` → `apps/web/src/client/**` (move map above); `web/app.html` → `apps/web/index.html`.
3. Root `package.json` scripts become groot's (`dev`, `build`, `check`, `test`, `db:*`, `groot:*`) plus app-owned `build:site` (marketing) and `build:og`.
4. `wrangler.jsonc` (child-owned): `main` → `apps/web/src/server/entry.worker.ts`,
   assets → `./dist/client`, keep `html_handling: none` + `run_worker_first`
   list extended with `/`, `/app*`, `/embed.js`, `/mcp`, marketing paths as today;
   add Text rules for `*.sql` + `embed_js.txt`; add `nodejs_compat`.

### Phase 2: Data layer (1–2d, highest care; see B2)

1. Build a local SQLite from legacy `migrations/`, `drizzle-kit pull` → app
   `db/schema.ts`; hand-check against the existing typed mirror.
2. Copy `migrations/0001–0007` into `apps/web/drizzle/` **keeping file names**,
   inserting `--> statement-breakpoint` between statements (fresh installs run
   them through `migrateD1`, which prepares one statement per split).
3. Import core+jobs schema re-exports; `pnpm db:generate` → `0008_core_tables`
   (kv, app_settings, jobs tables, notifications, storage files as applicable).
4. Verify on a local D1 seeded with prod's `d1_migrations` rows: `migrateD1()`
   skips 0001–0007 and applies 0008+ exactly once, and a fresh DB reaches the
   same schema. Test both paths in CI.

### Phase 3: Server port onto core (2–4d)

1. `createWebApp()`: mount the public routers first: the frozen widget surface
   (`/embed.js`, `/api/track`, `/api/suggestions`), `/mcp`, and the magic-link
   routes at `/api/v1/auth/*`. Then comes the `jwtAuthMiddleware` sub-app mounted
   at `/api/v1` (me/teams/sites/links/channels/keys/sitemap/crawl), matching
   groot's versioned layout. Public routers mount before the `/api/v1` sub-app
   so nothing shadows `/api/track` · `/api/suggestions`. Update the SPA client
   to the new base in the same change (D2).
2. Magic-link verify issues the core JWT cookie; `JWT_SECRET_KEY` resolution:
   env var → else generate once and persist in `app_meta` (preserves the
   zero-config deploy button; see B4).
3. Replace hand-rolled input guards with Zod schemas + `parseBody`/`parseQuery`
   per feature as each router moves (behavior-preserving; keep response shapes).
4. Convert raw SQL → Drizzle query builder feature by feature (links → sites →
   events/retention → keys → mcp → crawl → quota). No `db.transaction()` (D1);
   keep `db.batch()` where the code batches today.
5. Crawl queue seam (D3); digest/ratelimit behind small interfaces with DO impls.

### Phase 4: Worker entry + infra (1–2d)

1. `entry.worker.ts`: `startWebApp({ env: bindings, db: drizzle(DB), … })`,
   `migrateD1` on isolate init, `scheduled` (both legacy crons + jobs tick),
   `queue` consumer (crawl messages via services), DO class exports, optional
   Sentry off.
2. Port the ASSETS catch-all into app-owned `static-assets.ts` mounted last
   (marketing page map, `/app*` → SPA shell, trailing-slash 301, real-404
   status) with byte-for-byte behavior; `assets.test.ts` keeps guarding it.
3. Local dev: `pnpm dev:worker` (workerd + local D1 + queues) becomes the
   primary loop for crawl work; `pnpm dev` (Node) serves everything else.

### Phase 5: Client migration (3–5d)

1. TanStack Router → React Router 7 (D8): 13 route files → `src/client/pages/`
   wired through groot's `PAGES`/`ShellConfig` pattern in `App.tsx` (login,
   app layout guard, site context, settings, links list/detail, crawl,
   new site, index); URL filters move from `validateSearch` to nuqs. Keep
   TanStack Query hooks in `features/` as-is.
2. Swap hand-rolled `components/ui/*` → `@groot/ui`; app-shell → `@groot/shell`
   Layout; toasts → shell's. Map graphite tokens into the DLS theme (D7),
   light-only.
3. `lib/api.ts` → shell `apiClient` pointed at the `/api/v1` base (payload shapes still per D2).
4. Marketing site: `site/build.mjs` emits into `dist/client/` as a post-client-
   build step; `build:og` unchanged.
5. Screenshot-diff every page before/after (the marketing screenshots in
   `site/assets/img` double as a visual regression reference).

### Phase 6: Jobs adoption (optional, 1–2d, D5)

Retention + title backlog (+ digest later) as job handlers + `job_schedules`;
dashboard mounts under `/app/jobs`. Skip without loss if timing is tight.

### Phase 7: Tests (2–3d)

1. Port the 12 workerd suites to Node vitest against `startWebApp()` +
   in-memory SQLite; the fake `CrawlQueue` runs messages inline (crawl-run,
   titles, m4 tests become deterministic and fast).
2. DO behavior (digest windowing, rate-limit windows) tested through the seam
   interfaces with in-memory fakes; optionally keep one slim workerd config
   under an app-owned filename (e.g. `vitest.config.worker.ts` +
   `additional_exclusions`) for binding-level smoke tests (see B8).
3. Keep `tests/server/app/**` as the app-owned test area (sync-safe).

### Phase 8: Docs, CI, sync enablement (0.5–1d)

1. Rewrite `AGENTS.md` (groot child conventions; update the Dev/Domain-model
   sections to the new layout; note Workers-only reality).
2. README + deploy-button flow: pnpm/corepack build command, no manual
   `d1 migrations apply` (auto on first request), secret notes (B4).
   `.env.example` gains `RESEND_API_KEY`, `MAIL_FROM`, quota vars.
3. Enable `groot-sync.yml` CI (twice-daily sync PRs); first `pnpm groot:check`
   must report clean; `pnpm check` + full test suite green on the merged branch.

**Total: ~11–20 focused days.** Phases 2–4 are the risk core; 5 is the bulk.

## 6. Blockers & risks

These must be resolved or explicitly accepted; each has a proposed mitigation
above.

- **B1: Deployed-widget path freeze (hard).** `/embed.js`, `/api/track`,
  `/api/suggestions` are baked into customer 404 pages (embed.js is cached
  `max-age=86400` and installed permanently). They must never change path,
  payload contract, or CORS behavior; the `/api/v1` move (D2) applies only to
  the dashboard/auth surface the SPA consumes. Mount the public widget routers
  before the `/api/v1` sub-app so nothing shadows them, and add a contract
  test that pins these three endpoints.
- **B2: Migration bookkeeping continuity (hard).** Production D1 has
  `d1_migrations` rows named `0001_init.sql` … `0007_url_titles.sql` written by
  wrangler. The groot flow (drizzle-kit + `migrateD1`) reuses that table keyed
  by file name, so: never rename/regenerate the legacy files; the copied legacy
  SQL must be statement-split (breakpoint separators) or fresh installs
  (deploy button) break on multi-statement `prepare()`; and the first generated
  drizzle migration must sort after `0007_`. Needs a dedicated verification
  pass against a prod-shaped DB before anything deploys.
- **B3: Workers-only surface vs Node dev/test parity (structural).** Queues,
  DOs and the ASSETS binding have no Node equivalent; groot's dev/test loop is
  Node. Mitigation: seams (D3/D6) + inline fakes; accept that full crawl runs
  need `pnpm dev:worker`. If we instead keep the whole test suite in workerd,
  the synced `vitest.config.server.ts`/root-config surface will conflict
  perpetually (see B8). Not recommended.
- **B4: Zero-config self-hosting vs `JWT_SECRET_KEY`.** Core validates the
  secret from env; 404less's selling point is deploy-button-with-zero-secrets
  (today's session secret self-materializes in `app_meta`). Mitigation:
  generate-and-persist fallback wired before config validation. If rejected,
  self-host docs must add a `wrangler secret put` step (UX regression).
- **B5: Core auth/user model mismatch.** Core's auth module assumes its own
  users table (numeric ids, passwords, passkeys); 404less users are text UUIDs
  with magic-link only. Mitigation: don't mount core auth routers; mint core
  JWTs from the app-owned flow. Verify `AuthUser` typing tolerates string ids;
  if core hardcodes `number`, that needs a small upstream change in groot first
  (check before Phase 3; `pnpm upstream` the fix).
- **B6: Frontend rewrite blast radius.** Router swap + UI kit swap + theme +
  api-client churn across every page in one phase. Mitigation: server-first
  ordering, per-page porting order, screenshot diffs, and keeping response
  shapes stable (D2) so only the view layer changes.
- **B7: Build toolchain swap.** npm → pnpm, Vite → vite-plus, plus the dual
  output (SPA + marketing site) that groot doesn't have. Mitigation: marketing
  builder stays a standalone app-owned script emitting into `dist/client`;
  root `vite.config.ts` stays stock-synced.
- **B8: Sync-surface conflicts.** Root configs (`*.config.*`, tsconfigs,
  `.github/**`, `scripts/**`) are synced. Anything custom must live in
  app-owned paths or `additional_exclusions` or it will conflict on every sync.
  Also: the Cloudflare deploy button's build command (`npm ci`-based today,
  `build:cf` script) must be rewritten for pnpm/corepack. Verify the button's
  build image supports it before shipping docs.
- **B9: Free-tier budget: never move crawl onto the jobs table.** A 100-page
  crawl ≈ 600+ messages; as jobs that's ~1,800 row-writes (insert + claim +
  complete) × 48 runs/day ≈ 86k writes/day, nearly the entire 100k/day D1 free
  budget for one site. Queues consumer + `not_found_events` batching stays.
  Jobs are only for low-frequency work (retention, titles, digests).
- **B10: Housekeeping debt.** Two root lockfiles + `web/package-lock.json`
  (three package managers' state in one repo); `wrangler.jsonc` comment says
  `database_id` is "intentionally omitted" but one is committed. Reconcile
  with the deploy-button flow during Phase 0/8.

## 7. Deliberately not adopting

- Core password/passkey auth UI (magic-link stays; revisit passkeys later as an
  additive factor).
- R2 storage binding (no uploads in the product): `STORAGE` simply unbound.
- Sentry (no DSN set today; the seam is there if wanted).
- `@groot/ai` (no LLM features; suggest-ranker is local and cheap, so keep it).
- Node production deployment (Workers-only; entry stays app-owned anyway).

## 8. Definition of done

- [ ] `pnpm check`, `pnpm test`, `pnpm typecheck` green; `pnpm check:worker` bundles.
- [ ] `pnpm groot:check` clean; a no-op `pnpm groot:sync` changes nothing.
- [ ] Deploy to a staging Worker: fresh-DB install (button flow) and existing-DB
      upgrade both reach the same schema via `migrateD1` with zero manual steps.
- [ ] Widget contract test green (`/embed.js`, `/api/track`, `/api/suggestions`
      unchanged paths/CORS/payloads); no legacy `/api/*` dashboard routes
      remain (everything else lives under `/api/v1`); magic-link login works
      end to end.
- [ ] Crawler round-trip on a test site via `pnpm dev:worker`; digest + rate
      limit DOs functioning; crons firing.
- [ ] Dashboard visually equivalent (screenshot diff) on light theme.
- [ ] README deploy instructions executed by hand against a fresh fork.

## 9. Open questions

1. Workers-only (D6) acceptable, or is Node-runtime parity wanted enough to
   build queue/digest shims for `entry.node.ts` too?
2. One-time logout of all sessions when the cookie format changes: OK?
3. Jobs dashboard now (Phase 6) or defer until after the merge?
4. Enable automated groot-sync PRs immediately after merge, or start with
   manual `pnpm groot:sync` for a few weeks?
5. Any appetite for upstreaming 404less-driven core fixes (B5) into groot
   during the migration, vs. working around locally first?
6. **Baseline pin:** onboard from groot `main` @ `a4b4a76` now, or wait for
   the next tagged release (cleaner changelog for the first `groot:sync`)?
7. **Branch strategy:** OK with one long-lived `groot` branch that can't
   deploy for ~2–3 weeks (effectively a feature freeze on `main`), or do you
   need production deploys mid-migration? The latter means re-sequencing into
   smaller shippable increments: slower overall, but `main` stays live.
8. **Visual identity:** confirm D7. port the graphite palette into the groot
   DLS tokens (product keeps its current face; extra theming work) vs. adopt
   groot's default DLS look (cheaper, but the product's appearance changes)?
9. **E2E tests:** groot ships Playwright e2e infra; 404less has none today.
   Adopt it for the migrated client (+~1–2d in Phase 5/7), or skip?
10. **Demo & screenshot assets:** after the client rewrite, `site/assets/img/*`
    and the committed demo video/poster go stale. Budget a re-render
    (`docs/demo`, `pnpm build:og`) inside Phase 5, or handle later?
11. **`wrangler.jsonc` `database_id` (B10):** remove it to restore the
    deploy-button flow the file's comment describes, or keep it and fix the
    comment?
12. **B4 confirmation:** happy with the `app_meta` auto-generated
    `JWT_SECRET_KEY` fallback (preserves zero-config self-hosting, small bit
    of app-owned wiring), or require the secret explicitly and keep the env
    surface stock-groot (self-host docs gain one setup step)?
13. **D8 router decision:** confirm staying on React Router (port 404less,
    ~bounded in Phase 5) vs. evolving groot to TanStack Router first as a
    separate major-version initiative (delays this onboarding, breaks all
    children in lockstep when synced).

---

## 10. Execution notes (2026-10-31)

Decisions confirmed: keep 404less's magic-link session (no core JWT), full
migration in one pass, React Router + `@groot/ui` + graphite tokens, jobs
deferred (both crons + Queues unchanged). Baseline pinned at groot `a4b4a76`
(`pnpm groot:check` → "Already in sync").

Deviations from the plan above, and why:

- **D1 / B4 (auth & secrets):** no core JWT. Core's `AuthUser.userId` is a
  number and `verifyToken` rejects string ids; 404less ids are UUIDs. The
  session cookie (`f404_session`) and its `app_meta` secret are unchanged, so
  nobody is logged out. `GET /api/v1/auth/me` answers in groot's envelope so
  `@groot/shell`'s session store/ProtectedRoute work. groot's production env
  checks (JWT_SECRET_KEY, ADMIN_AUTH_KEY, ORIGIN, RP_ID) are satisfied in
  `worker/boot.ts` from `app_meta` / the request when unset (zero-config kept).
- **B2 (schema):** the app schema must NOT re-export core's `users`/`passkeys`
  (name clash with 404less's `users` → drizzle-kit would rewrite it). Only
  `kv` is adopted (`0008_core_kv.sql`). Legacy 0001–0007 keep their names, got
  statement breakpoints (verified byte-identical once removed), and are
  journalled with idx 1–7 + `meta/0007_snapshot.json` so drizzle-kit numbers
  new files from 0008. Structural diff vs the legacy DB: identical except
  cosmetic unique-index names and TEXT-PK NOT NULL (see schema.ts header).
  Pinned by `tests/worker/groot-migration.test.ts` (prod-shaped upgrade ==
  fresh install; data + session secret survive).
- **Phase 3.4 (query builder):** done. Every query uses Drizzle's builder on
  groot's `db` (`sql` fragments only for correlated subqueries, CASE and
  instr); schema keys are snake_case so API JSON is unchanged. Verified by
  the workerd suite plus a one-off parity run of the legacy SQL vs the new
  services on seeded data (identical results). Two pre-existing bugs fixed
  afterwards (tests/worker/link-status.test.ts): the crawler now stamps
  `resolved_at` when it resolves an open link (and never on ignored rows), and
  bulk triage chunks its ids so 100 ids stay under D1's 100-parameter cap.
- **B1 (CORS):** groot's `createApp` applied credentialed CORS to every path
  first (widget preflights never reached `cors({origin:'*'})`, and setting
  `CORS_ALLOWED_ORIGINS` would have broken customer widgets). Fixed in groot,
  non-breaking: `createApp({ openCorsPaths })` (+ test + changeset in groot,
  uncommitted in ~/Code/groot).
- **B3 / Phase 7 (tests):** the 12 workerd suites stay the primary suite
  (`pnpm test:worker`, app-owned `vitest.config.worker.ts`) against the real
  production entry, instead of a Node port; groot's Node suites run via
  `pnpm test`, plus `tests/server/app/node-runtime.test.ts`. Synced suites for
  features 404less doesn't mount (core auth/passkey/settings/storage, todos,
  jobs) are in `additional_exclusions`.
- **D6 (runtime):** Workers is production; `pnpm dev` (Node) works with
  in-process stand-ins for the queue/DOs (`node-bindings.ts`).
- **Phase 5 (shell):** 404less keeps its own site-scoped app shell (site
  switcher, per-site nav + open-links badge) built from `@groot/ui`; groot's
  `Layout`/`SidebarNav` only take static destinations.
- **Legacy sign-in links:** `/auth/verify` 302s to `/api/v1/auth/verify`
  (links already in inboxes at deploy time, 15-minute TTL).
