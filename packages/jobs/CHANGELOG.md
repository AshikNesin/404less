# @groot/jobs

## 1.0.1

### Patch Changes

- [#140](https://github.com/AshikNesin/groot/pull/140) [`68254db`](https://github.com/AshikNesin/groot/commit/68254db6c9f7f4378a93cb8f5c89746877295bb2) Thanks [@AshikNesin](https://github.com/AshikNesin)! - New default look: a warm monochrome theme, ported from tiny-agents, applied consistently across every primitive and page. Every app that syncs `packages/**` picks it up, so review your pages after syncing. The rules are in `docs/features/dls.md` ("Shape and size").

  - **Theme tokens** (`@groot/shell` `index.css`): off-white / near-black surfaces with a faint warm cast, foreground-derived hairline borders, an achromatic primary, and a larger `--radius` (0.75rem). In dark mode `--muted` and `--secondary` sit one step above `--card`, so hover and selected fills show on cards. The sidebar tokens now hold real values (the sidebar uses them). Each theme sets `color-scheme`, the body uses `100dvh`, and scrollbars get a quiet thumb. CodeMirror's background, gutter and active line follow the tokens.
  - **One control scale** (`@groot/ui`): `Button`, `Input`, `SelectTrigger`, `InputGroup` and `TabsList` share heights (`sm` h-7, default h-9, `lg` h-10) and are `rounded-xl` at every size. `Button` default is h-9, `lg` h-10, `icon` size-9, `icon-lg` size-10; `Input` and `InputGroup` are h-9. Outline buttons are transparent, so they take the surface they sit on.
  - **Surfaces**: `Card` `rounded-2xl`. `Dialog` and `AlertDialog` (and so `useConfirm`) are viewport-capped flex columns, `rounded-3xl` with `p-6`, over a `bg-black/40` backdrop without blur; their footers drop the grey band and negative margins, so drop any compensating spacing. New `DialogBody` scrolls tall content between a pinned header and footer. Dropdown menus and the select menu are `rounded-xl` with `rounded-lg`, roomier items; the command palette uses the dialog radius; tooltips `rounded-lg`; `Alert` `rounded-xl`; toasts `rounded-xl`.
  - **Toasts follow the theme**: `Toaster` reads the `dark` class on `<html>`, so rich-color toasts are no longer light on a dark page.
  - **Contrast**: destructive text on `Badge` and `StatusBadge` mixes in the foreground so it reaches 4.5:1 on its red tint.
  - `GrootUIProvider` takes a `toaster` prop (sonner `ToasterProps`, e.g. `position`).
  - **Shell chrome**: `SidebarNav` uses the sidebar tokens, a hairline border and `h-9 rounded-xl` rows; the collapsed rail now keeps search and the account menu. The page background is `bg-background` instead of `bg-muted/40`, and the mobile top bar is opaque. Settings search, list rows, the new-setting form and the JSON editor frame follow the control scale; the storage table frame matches `Card`. `ThemeMenu` is exported from `@groot/shell/components/Layout`.
  - **`@groot/jobs`**: page-header and job-detail actions use the default size; the filter toolbar (tabs, search, Queue, Date) is one height; the job type picker looks like a select; job dialogs scroll their forms in `DialogBody`; JSON, log and error blocks are `rounded-xl`.

- Updated dependencies [[`68254db`](https://github.com/AshikNesin/groot/commit/68254db6c9f7f4378a93cb8f5c89746877295bb2)]:
  - @groot/shell@1.1.0
  - @groot/ui@0.8.0

## 1.0.0

### Major Changes

- [#133](https://github.com/AshikNesin/groot/pull/133) [`c1fdac9`](https://github.com/AshikNesin/groot/commit/c1fdac9cc529d7292d9694b79b9b1fbc48df766a) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Rebuild the server on Hono + Drizzle (SQLite only) so the same app runs on Node and on the Cloudflare Workers free plan.

  **Breaking changes**

  - **HTTP layer:** Express is gone. Routers are plain `new Hono<AppEnv>()`; handlers return `ok(c, data, status?)` / `noContent(c)` (`@groot/core/utils/api-response.utils`) and read input with `await parseBody(c, schema)`, `parseQuery(c, schema)`, `parseId(c.req.param("id"))`, `requireUser(c)`. `createRouter`, `handle`, `createServer`, `setupSpaFallback`, `setupErrorHandling`, `startServer` and the Express-typed middlewares no longer exist; use `createApp({ routes })` from `@groot/core/app` and the runtime entries `apps/web/src/server/entry.node.ts` / `entry.worker.ts`.
  - **Database:** Prisma and PostgreSQL support are removed. The schema is Drizzle TypeScript (`packages/core/src/database/schema.ts`, `packages/jobs/src/server/schema.ts`, `apps/web/src/server/db/schema.ts`), `db` comes from `@groot/core/database` and is set by `bootstrap()`, migrations are generated with `pnpm db:generate` into `apps/web/drizzle/` and applied on boot (Node) or with `pnpm db:migrate:worker` (D1). Table and column names changed (`users`, `passkeys`, `todos`, `kv`, `jobs`, `job_schedules`, `job_logs`, snake_case columns): existing databases need a fresh migration or a one-off data copy.
  - **Jobs:** pg-boss and honker are replaced by a table-backed queue. `JobQueueAdapter`, `initJobQueue`, `getJobQueue`, the adapter subpaths, `controller` and `error-handler` are removed. Jobs are `Job` rows with camelCase fields (`runAt`, `startedAt`, `completedAt`, `retryLimit`, `retryCount`, `retryDelay`, `output`, `error`, `singletonKey`) and five states (`created`, `active`, `completed`, `failed`, `cancelled`). Handlers receive `{ id, name, data, attempt, logger }` and may return an output value. Schedules are one per job name (no `key`). `runTick()` drives the queue: polled on Node (`startWorkers()`), cron trigger on Workers, and inline after `addJob()`.
  - **Config and env:** `config.yml`, the YAML loader and varlock are removed. Configuration is `defineConfig()` in `apps/web/src/server/config.ts` on top of `defaultConfig(env)` (`@groot/core/config`); environment variables are validated by the Zod schema in `@groot/core/env` and documented in `.env.example`. Development needs no `.env`; production requires `JWT_SECRET_KEY`, `ADMIN_AUTH_KEY`, `ORIGIN` and `RP_ID`.
  - **Auth:** passwords are hashed with PBKDF2-SHA256 (WebCrypto) instead of bcrypt, JWTs are issued with `jose`. Existing bcrypt hashes are not accepted; users must reset their passwords.
  - **KV:** Keyv is replaced by the `kv` table (`kv`, `createNamespaceKv`, `purgeExpiredKv` in `@groot/core/kv`) with a slightly different API (`list(prefix)`, `clear(prefix)`).
  - **Logger:** pino is replaced by a small structured logger with the same call shape (`logger.info(data, msg)`, `.child()`); `createRequestLogger` now takes a plain descriptor and request context lives in `@groot/core/context`.
  - **Storage:** the files-sdk adapter is injected through `bootstrap({ storage })`: `localStorage()` on Node, `r2Storage(env.STORAGE)` on Workers. `STORAGE_DRIVER` and the bundled S3 adapter are gone (pass `files-sdk/s3` yourself if you need it).
  - **Build output:** the client builds to `dist/client` and the Node bundle to `dist/server/bundle.js`; `pnpm start` migrates on boot (no `prestart`).

  **New**

  - Cloudflare Workers target: `wrangler.jsonc` (D1, R2, Static Assets, one cron trigger), `pnpm dev:worker`, `pnpm check:worker`, `pnpm deploy:worker`, `docs/guides/deploy-cloudflare.md`.
  - Zero-config local development (`pnpm dev` with no `.env`), `pnpm db:studio`, `pnpm db:seed`.

### Patch Changes

- Updated dependencies [[`c1e5177`](https://github.com/AshikNesin/groot/commit/c1e5177f72bce07990e72f6678a210b62005d472), [`b89d44b`](https://github.com/AshikNesin/groot/commit/b89d44b150dea6c256cf1c8331f5d5792d0ffd4d), [`6002a46`](https://github.com/AshikNesin/groot/commit/6002a46dabe53ab067472cfa03862d18e1d9fcdc), [`c1fdac9`](https://github.com/AshikNesin/groot/commit/c1fdac9cc529d7292d9694b79b9b1fbc48df766a), [`1ae96c1`](https://github.com/AshikNesin/groot/commit/1ae96c1e85afd0c0d2562958589b2ee2f08bacf8), [`6209997`](https://github.com/AshikNesin/groot/commit/620999778ed329ee20b55f810f80b368db158dd4), [`8ab9eee`](https://github.com/AshikNesin/groot/commit/8ab9eeee9b3029330f8f70d06e6cf31b3f3eb42f), [`191f6a6`](https://github.com/AshikNesin/groot/commit/191f6a6ea0efe632f8bf8fc3221f81ab01e9d0c9)]:
  - @groot/shell@1.0.0
  - @groot/core@1.0.0
  - @groot/ui@0.7.3

## 0.9.4

### Patch Changes

- [`129a729`](https://github.com/AshikNesin/groot/commit/129a729d3c658c6ff121a50a3741f2e2cb5ec27e) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Import `PageLayout`/`Section` from their own files instead of the `components/layout` barrel. On case-insensitive filesystems (macOS) `@groot/shell/components/layout` resolved to `Layout.tsx`, which broke the dev server and typecheck.

- Updated dependencies [[`2c06f72`](https://github.com/AshikNesin/groot/commit/2c06f72266b4edf9a9eaa35a1ad3814155d6d730), [`aba55a5`](https://github.com/AshikNesin/groot/commit/aba55a5205f5c05137f1203af639f8b2e5dcd108), [`7b86607`](https://github.com/AshikNesin/groot/commit/7b86607a4147a66373e1e5c3b8457d81e25a50e6), [`72ce54c`](https://github.com/AshikNesin/groot/commit/72ce54c32d03c89018fddb5487b4b64662953d2c), [`ae93587`](https://github.com/AshikNesin/groot/commit/ae93587bec63fcdab1f0885e92ff7b990294802d), [`9afae1d`](https://github.com/AshikNesin/groot/commit/9afae1d6d901ed02f0b3c82ddcd6c781229ca636), [`664f989`](https://github.com/AshikNesin/groot/commit/664f989db27179fd61059a1002506c27c8264023), [`84f82a9`](https://github.com/AshikNesin/groot/commit/84f82a9ec4c54aab0b005c495f7bd14b4d46b9db), [`e3614e4`](https://github.com/AshikNesin/groot/commit/e3614e4bce049f0cb71ee28bcb24cfeed05fd110)]:
  - @groot/core@0.10.3
  - @groot/shell@0.11.0
  - @groot/ui@0.7.2

## 0.9.3

### Patch Changes

- [#123](https://github.com/AshikNesin/groot/pull/123) [`297f957`](https://github.com/AshikNesin/groot/commit/297f957bc0fcda60dcb63deb770bda7860e92b7e) Thanks [@exe-dev-github-integration](https://github.com/apps/exe-dev-github-integration)! - Complete the typecheck graph: add a client typecheck script and CI step, and a coverage guard that fails when a source file belongs to no checked project. Repo-owned `.d.ts` files under the covered roots are typechecked in a dedicated skipLibCheck:false pass instead of counting toward coverage unchecked. The two live fixes touch kit source: the jobs client re-export path in `packages/jobs/src/client/types.ts`, the `cn` import in `packages/shell/src/components/PasskeyManager.tsx`, and the tooltip entry added to the `packages/ui/src/index.ts` barrel (tooltip.tsx existed since e997f40 but was never exported from the barrel before this PR), so the three kit packages carry the same patch as the root.

- [#127](https://github.com/AshikNesin/groot/pull/127) [`73677b0`](https://github.com/AshikNesin/groot/commit/73677b01da2163aca4d8c78c35f637b124a58b5e) Thanks [@exe-dev-github-integration](https://github.com/apps/exe-dev-github-integration)! - Add a compiled consumer fixture for the shipped kit surface, an explicit exports map for @groot/ui and @groot/jobs, and a guard that fails when the map and the fixture drift.

- Updated dependencies [[`297f957`](https://github.com/AshikNesin/groot/commit/297f957bc0fcda60dcb63deb770bda7860e92b7e), [`73677b0`](https://github.com/AshikNesin/groot/commit/73677b01da2163aca4d8c78c35f637b124a58b5e), [`09fea32`](https://github.com/AshikNesin/groot/commit/09fea322f9fa0c12397d8dccbc88638612dd99ca)]:
  - @groot/shell@0.10.3
  - @groot/ui@0.7.1
  - @groot/core@0.10.2

## 0.9.2

### Patch Changes

- [`960a9c1`](https://github.com/AshikNesin/groot/commit/960a9c15e059e49b2edcfb837875c9efc399190d) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Add DLS composition components: DataField/DataFields, StatTile, listRowClass

  Ships the recurring higher-order patterns the DLS audit found hand-rolled across groot and the child projects (nesins-finance-api alone had 9 files of drifting dt/dd display fields; list-row hover treatments appeared in 86 child files).

  - `@groot/ui/display` (new): `DataField` (label/value pair, `dt`/`dd`, meta-label typography) + `DataFields` (responsive 2→4 col grid wrapper). The display counterpart to form-`Field` from `@groot/ui/form`.
  - `@groot/ui/stat-tile` (new): `StatTile` — meta label + optional icon + `statClass` value, with a clickable/active variant for filter-stats (JobsStats' pattern).
  - `@groot/ui/list-row` (new): `listRowClass` / `listRowGridClass` — the interactive list-row treatments as class constants (`tableColumnHeaderClass` precedent; rows stay semantic elements). Unblocks child projects against the new transition-colors gate rule on next sync.
  - Consumers reconciled: JobOverview (local `Field` deleted), JobDetail singleton section, JobsStats (inline tile → `StatTile`), JobsTable (both row variants), ScheduledJobsPanel, Todos, PasskeyManager.
  - Docs: `docs/features/dls.md` gains a composition-components section (with the pull-don't-push doctrine); `docs/features/client.md` rules table extended.

- [`e95a091`](https://github.com/AshikNesin/groot/commit/e95a09100a8459eab096df4d414ba081d8454112) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Introduce the DLS: a closed type scale, Kumo-adapted rules, and enforcement

  Establishes the repo's Design Language System as a written spec plus enforced rules — built on the existing stack (Tailwind v4 + Radix/shadcn + cva), with Cloudflare's Kumo as reference, not dependency.

  - `@groot/ui/typography` (new): `Text` component + exported classes — `titleClass`, `h1Class`, `statClass`, `displayClass`, `monoClass`, `metaLabelClass`. The type scale is now closed; pages never pick `text-*` sizes ad hoc. `tableColumnHeaderClass` now equals `metaLabelClass` (one definition of the meta-label idiom).
  - 4 new gate rules in `scripts/check-design-tokens.ts` (9 total): `tracking-modified` (no `tracking-*`, except `metaLabelClass`), `font-bold` (banned; `font-semibold` is max), `transition-colors-hover` (instant color hover in pages; primitives exempt as the motion layer), `inline-mono-full-step` (inline mono at `text-[0.9em]`). `allow` lists now support directory-prefix entries.
  - Drift reconciled: `tracking-tight` removed from 8 headings; local meta-label copies in jobs → `tableColumnHeaderClass`; inline `font-mono text-sm` → `text-[0.9em]`; `transition-colors/all` removed from 18 page/shell sites (primitives keep theirs). Login h1 uses `h1Class`; marketing h2 uses `displayClass`.
  - Docs: `docs/features/dls.md` (spec + rationale + rejected alternatives); rules table extended in `docs/features/client.md`; AGENTS.md index link.
  - Agent skill: `.agents/skills/groot-dls/SKILL.md` — the distilled non-negotiables for AI sessions.

- Updated dependencies [[`960a9c1`](https://github.com/AshikNesin/groot/commit/960a9c15e059e49b2edcfb837875c9efc399190d), [`e95a091`](https://github.com/AshikNesin/groot/commit/e95a09100a8459eab096df4d414ba081d8454112), [`81cfc6d`](https://github.com/AshikNesin/groot/commit/81cfc6d9797f3d51d6b79555ac933d1eebacb83a), [`bb4e94d`](https://github.com/AshikNesin/groot/commit/bb4e94d544ce23d4e8fe35411ff2fcc72bec4c3c), [`9477a61`](https://github.com/AshikNesin/groot/commit/9477a61b24c2f2d722ceb476cba652c34af96acb)]:
  - @groot/ui@0.7.0
  - @groot/shell@0.10.2
  - @groot/core@0.10.1

## 0.9.1

### Patch Changes

- [`9e5602a`](https://github.com/AshikNesin/groot/commit/9e5602a68d11df36357165df982f71cb8d6c2a79) Thanks [@AshikNesin](https://github.com/AshikNesin)! - feat: restore child-project primitives removed by the v2.6.0 dead-code audit

  The v2.6.0 simplification pass verified "zero importers" via the in-repo
  import graph — the right bar for app code, the wrong bar for a boilerplate's
  shipped surface. Child projects (nesins-finance being the reference fork)
  consumed these within months of forking, and their removal forces every
  consumer to vendor copies that then drift. Restored on proven child-project
  demand:

  - `@groot/ui`: `alert`, `select`, `pagination`, `tooltip` primitives and
    barrel exports (select alone had 30 importers in the first child project).
    The barrel now documents that this package is the component kit shipped to
    child projects — absence of in-repo importers is not dead code.
  - `@groot/core/logger`: `logPerformance` (duration-escalating performance
    record) and the breadcrumb subsystem (`addBreadcrumb` /
    `getBreadcrumbs` / `clearBreadcrumbs`, context wiring, `buildErrorContext`
    attachment) — used by child projects' job and ingestion instrumentation.
  - `@groot/core/storage`: `copyFile` (404-guarded object duplication for
    workflow/template-style derived files).

  `@groot/jobs` worker now emits a `logPerformance` record per completed/failed
  job (real in-repo consumer; slow jobs escalate to `warn` at >5s), and each
  restored surface ships with tests: breadcrumbs (context isolation, 50-cap),
  logPerformance (level escalation, record shape), copyFile (happy path, 404,
  independence), and Alert/Select/Pagination/Tooltip component tests.

  Not restored (no child-project demand, pure aliases): `createLogger` (use
  `logger.child`), `parseLimit`, the storage DTO type aliases, and the 16
  date helpers removed from `@groot/shell/lib/date.utils`.

- Updated dependencies [[`9e5602a`](https://github.com/AshikNesin/groot/commit/9e5602a68d11df36357165df982f71cb8d6c2a79)]:
  - @groot/core@0.10.0
  - @groot/ui@0.6.0
  - @groot/shell@0.10.1

## 0.9.0

### Minor Changes

- [`18e3200`](https://github.com/AshikNesin/groot/commit/18e3200e3a34db550672c49aa2c5683a4f261b11) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Codebase simplification pass — dead code, duplication, API surface

  Audit-driven cleanup, no behavior changes. Verified green across every layer: typecheck, lint, 211 unit tests, full build, 6 e2e tests. All removals were verified to have zero real consumers via import-graph resolution.

  Dead code (~1,300 LOC across 22 files):

  - date/shell lib helpers with zero callers (25→9 date fns; dropped `formatCurrency`, `debounce`, `truncate`, `getInitials`)
  - one-line Prisma pass-throughs in auth/passkey services; never-wired `auth.deleteUser`, `storage.copyFile`, 6 storage DTO aliases
  - vestigial breadcrumb subsystem (zero `addBreadcrumb` callers), dead `createLogger`/`logPerformance`/`parseLimit`/`useBulkUpload`/`todoJobOptions`
  - 4 orphan ui primitives: `alert`, `pagination`, `select`, `tooltip` (423 lines, zero real importers)

  Duplication:

  - The jobs client `Job`/`ScheduledJob` types now alias the server adapter's `QueueJob`/`ScheduledJobInfo` instead of maintaining a second drifting 19-field shape
  - `withJobToast` helper replaces 15 identical try/toast/catch blocks in `useJobs`/`useJobDetail`
  - `TextInputDialog` consolidates the CreateFolder/Rename dialogs

  Also fixes pre-existing breaks on main: the job-logger level gate was typed `pino.LevelWithSilent` (root tsc exited 2), the pretest hook resolved the DEV database when NODE_ENV wasn't set (now `NODE_ENV=test` everywhere; `ensure-test-db.ts` refuses to run when `TEST_DATABASE_URL` is unset), and login + todos e2e specs drifted from the UI copy.

### Patch Changes

- [`18e3200`](https://github.com/AshikNesin/groot/commit/18e3200e3a34db550672c49aa2c5683a4f261b11) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Simplify the jobs client: single source of truth for job types, withJobToast, shared job utils

  - The jobs client `Job`/`ScheduledJob` now alias the server adapter's `QueueJob`/`ScheduledJobInfo` (type-only import, erased in the client bundle) — one source of truth instead of two drifting 19-field shapes; the dead client `JobState` enum and two re-export shims are deleted.
  - `withJobToast` helper replaces 15 identical try/toast/catch blocks in `useJobs`/`useJobDetail`.
  - Job-level options helpers (`todoJobOptions`) and dead validation/constant exports removed.

- [`18e3200`](https://github.com/AshikNesin/groot/commit/18e3200e3a34db550672c49aa2c5683a4f261b11) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Start the honker scheduler loop and support multiple schedules per queue via options.key

  Two honker (SQLite) fixes:

  - The scheduler loop was never started, so cron schedules never fired. The adapter now starts honker on init.
  - `schedule()` used the job name as the honker schedule name, so scheduling the same job at two different times (e.g. 9:30am and 6pm daily) overwrote the first entry. `ScheduleJobOptions.key` is now honored by naming the schedule `job:key` (plain job name when no key, back-compat), mirroring pg-boss's singleton-key schedules. `getSchedules()` maps the composite name back to `{ name, key }`; `unschedule(name, key)` removes one entry.

- [`18e3200`](https://github.com/AshikNesin/groot/commit/18e3200e3a34db550672c49aa2c5683a4f261b11) Thanks [@AshikNesin](https://github.com/AshikNesin)! - DB-persisted job logs gated by ops log level — dashboard showed nothing in production

  The pino ROOT level (from config.logging.level, default `warn` in production) gated records before the JobLogStream ever saw them: info lines from job handlers were dropped, job_logs stayed empty, and the dashboard's log panel rendered nothing at all. Additionally pino.multistream's per-stream default level is `info`, so debug lines never persisted even in dev.

  - Pin the DB stream to an `info` floor: quieter ops levels (warn/error) only quiet the console, never the persisted history the dashboard reads.
  - Honor more-verbose ops levels (debug/trace) on the DB stream too.
  - Keep the console stream at the exact ops level; `silent` stays silent.
  - Engine-agnostic: JobLogStream writes via Prisma (job_logs), shared by honker (SQLite) and pg-boss (Postgres).

- Updated dependencies [[`18e3200`](https://github.com/AshikNesin/groot/commit/18e3200e3a34db550672c49aa2c5683a4f261b11), [`18e3200`](https://github.com/AshikNesin/groot/commit/18e3200e3a34db550672c49aa2c5683a4f261b11)]:
  - @groot/core@0.9.0
  - @groot/shell@0.10.0
  - @groot/ui@0.5.0

## 0.8.3

### Patch Changes

- [#111](https://github.com/AshikNesin/groot/pull/111) [`19a086c`](https://github.com/AshikNesin/groot/commit/19a086c832c9a009ecef2ff3eaf905f24d54f2a7) Thanks [@AshikNesin](https://github.com/AshikNesin)! - fix: prevent row navigation when selecting jobs in table

- [`d03042b`](https://github.com/AshikNesin/groot/commit/d03042b6798461138fccb5d1881b2f9e80521153) Thanks [@AshikNesin](https://github.com/AshikNesin)! - feat: render job-data links inline within the JSON view

  Replaces the separate Structured/JSON toggle in `JobJsonBlock` with a single
  read-only JSON panel that highlights resolver-matched values as clickable
  links. Link ranges are computed while pretty-printing (`stringifyWithLinks`)
  and rendered as CodeMirror decorations that navigate on click.

  - `JobJsonBlock` no longer toggles between `JobDataView` and raw JSON; it always
    shows JSON with inline link highlights.
  - `CodeMirrorEditor` gains `linkRanges` and `onLinkClick` props to drive
    `Decoration.mark` ranges + click handling, plus a `.cm-json-link` style.

- Updated dependencies [[`cc632b9`](https://github.com/AshikNesin/groot/commit/cc632b982912b5d9261bfd268813ed25a30ef395), [`d03042b`](https://github.com/AshikNesin/groot/commit/d03042b6798461138fccb5d1881b2f9e80521153)]:
  - @groot/core@0.8.1
  - @groot/shell@0.9.1

## 0.8.2

### Patch Changes

- [`399ee35`](https://github.com/AshikNesin/groot/commit/399ee35d36a4bae5fcd3df68b481170d6f68da53) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Adopt the shared UI primitives in the jobs client instead of local reimplementations.

  - `JobDetail` renders through `PageLayout`, using the new `breadcrumb` / `titleAdornment` slots and the `Breadcrumb` primitive. It previously duplicated `PageHeader`'s `<h1>` classes verbatim and hand-rolled its breadcrumb trail.
  - `JobsTable` and `ScheduledJobsPanel` use `Section` for their headings and import `tableColumnHeaderClass` instead of each declaring a local `COLUMN_HEADER` constant.
  - Empty and error surfaces in `JobsTable` and `JobDetail` use `EmptyState` / `ErrorState`, so their icon sizes and spacing now match every other list in the app.

- Updated dependencies [[`399ee35`](https://github.com/AshikNesin/groot/commit/399ee35d36a4bae5fcd3df68b481170d6f68da53), [`399ee35`](https://github.com/AshikNesin/groot/commit/399ee35d36a4bae5fcd3df68b481170d6f68da53)]:
  - @groot/shell@0.9.0
  - @groot/ui@0.4.0

## 0.8.1

### Patch Changes

- Updated dependencies [[`c097350`](https://github.com/AshikNesin/groot/commit/c0973502ae2e731094876e05dcfc9b3db6b3ccfc), [`c097350`](https://github.com/AshikNesin/groot/commit/c0973502ae2e731094876e05dcfc9b3db6b3ccfc), [`c097350`](https://github.com/AshikNesin/groot/commit/c0973502ae2e731094876e05dcfc9b3db6b3ccfc)]:
  - @groot/core@0.8.0
  - @groot/shell@0.8.0

## 0.8.0

### Minor Changes

- [`e64cc32`](https://github.com/AshikNesin/groot/commit/e64cc32d34a41936bba0b00f7758059eb2d83723) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Add generic link resolution for job data fields.

  - **JobDataLinkContext**: New `JobsProvider` + `useJobDataLink` hook so consuming apps can configure a `linkResolver` that maps `(key, value)` to `{ to, label? }`.
  - **JobDataView**: Structured key-value renderer with recursive flattening (dot-notation keys). Linkable values render as `<Link>` with an ExternalLink icon.
  - **JobJsonBlock**: Added Structured/JSON toggle — defaults to structured view when a linkResolver is configured, raw JSON otherwise.

### Patch Changes

- [`02a221b`](https://github.com/AshikNesin/groot/commit/02a221b8f8a83ba095a12dc986090fce897af10f) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Add job state label to the jobs table.

## 0.7.4

### Patch Changes

- Updated dependencies [[`0051546`](https://github.com/AshikNesin/groot/commit/005154619ee39ca399a96bcea02ba0fbbcfd3e91), [`5efcd19`](https://github.com/AshikNesin/groot/commit/5efcd19c4d87de3afc47c32d8aae8fe2bd20e525)]:
  - @groot/shell@0.7.0

## 0.7.3

### Patch Changes

- Updated dependencies [[`90c30e0`](https://github.com/AshikNesin/groot/commit/90c30e02b09c3e355bd8a0aa0f431006dd55431b)]:
  - @groot/ui@0.3.0
  - @groot/shell@0.6.2

## 0.7.2

### Patch Changes

- [#102](https://github.com/AshikNesin/groot/pull/102) [`011c6d5`](https://github.com/AshikNesin/groot/commit/011c6d5595ea9e4fff8911f56e497e497aecb380) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Fix pg-boss jobs list showing blank metadata; replace native confirm with a styled dialog

  The jobs dashboard table was missing data for pg-boss (Postgres) jobs: the
  "Started" column showed "—", "Created" showed "N/A", retry counts read 0, and
  expire/keep-until/dead-letter were empty — for _every_ job in the list (active
  jobs most visibly, since they always have a `started_on`). The stats counts at
  the top of the page were correct; only the per-row metadata was broken.

  Root cause: the raw-SQL dashboard queries (`getJobs`/`getJobsByState`/
  `getFailedJobs`) aliased columns to lower-case keys (`startedon`), but the
  shared `normalizeBossJob` reads pg-boss's camelCase shape (`startedOn`), so
  every camelCase field resolved to `undefined` → null/empty/0. Only
  `getJobById` (pg-boss's own accessor) was correct, which is why the detail
  page showed the right values. Fixed by aliasing the raw-SQL projection to
  camelCase (double-quoted so Postgres preserves case), matching the shape
  `normalizeBossJob` reads, so both paths agree.

  Also replaces every native `window.confirm()` — jobs page (bulk re-run,
  purge-by-state, delete job, cancel scheduled job) and storage page (delete
  files, delete folder) — with a new shared `ConfirmProvider`/`useConfirm`, a
  thin imperative convenience layer over a Radix `AlertDialog` primitive (a port
  of shadcn's `alert-dialog`). Both live under `@groot/ui/primitives` so callers
  know they are composed/Radix-backed, not direct shadcn re-exports. Using
  AlertDialog gives correct confirm semantics: the dialog can ONLY be closed by
  the action/cancel buttons or Escape (not by clicking the overlay), so a
  confirmation can never be dismissed accidentally. `Button` now exports a named
  `ButtonProps` so the alert-dialog action/cancel slots compose with the shared
  button variants (destructive, outline).

- Updated dependencies [[`011c6d5`](https://github.com/AshikNesin/groot/commit/011c6d5595ea9e4fff8911f56e497e497aecb380)]:
  - @groot/ui@0.2.2
  - @groot/shell@0.6.1

## 0.7.1

### Patch Changes

- Updated dependencies [[`b9906ec`](https://github.com/AshikNesin/groot/commit/b9906ec95ba2702d5f7f3176333e65be30a2ff8f)]:
  - @groot/shell@0.6.0

## 0.7.0

### Minor Changes

- [#84](https://github.com/AshikNesin/groot/pull/84) [`a9b3825`](https://github.com/AshikNesin/groot/commit/a9b3825a930988d6fcbe9e7f0e53cc8fce5b470e) Thanks [@exe-dev-github-integration](https://github.com/apps/exe-dev-github-integration)! - Redesign jobs UI for consistency and add loading skeletons

  The jobs pages used a bespoke layout that diverged from the rest of the app:
  a small custom header, heavy `border-dashed` styling on stat cards / tables /
  detail blocks, and inconsistent button sizing. They now match the app's
  established design language:

  - Jobs and JobDetail use the shared `PageLayout` / `PageContainer` for a
    consistent header (title + description + actions) and spacing.
  - Stat cards are now a single compact clickable Card row (dub-inspired) instead
    of seven dashed-border boxes.
  - The jobs table and scheduled-jobs panel are wrapped in Cards with clean
    rounded borders; detail sections (Overview, Data, Output, Logs, Singleton,
    Error) use Card + CardHeader/CardTitle.
  - Actions, filter controls, and dialog triggers use the standard Button size
    scale and `size-*` icons.

  Loading states are now proper skeletons that match the loaded layout instead
  of a centered spinner or a sudden layout jump:

  - A reusable `skeletons.tsx` module (`JobsStatsSkeleton`, `JobsTableSkeleton` /
    `JobRowSkeleton`, `ScheduledJobsSkeleton`, `JobDetailSkeleton`) shares the
    shapes across every loading surface so they stay in sync with the real
    components.
  - Stats, the jobs table, scheduled jobs, and the job detail page all render
    their skeleton while their data loads.

## 0.6.2

### Patch Changes

- [`b0a391b`](https://github.com/AshikNesin/groot/commit/b0a391b85274ab8cf2f6837b8dda4dadf6f716a1) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Improve form field spacing and consistency

  The shared `form.tsx` primitives now apply more consistent spacing
  between fields. Updated the job dialogs (Add/Edit/Schedule) and
  AppSettings form to use the improved form components for uniform
  vertical rhythm across forms.

- [`b0a391b`](https://github.com/AshikNesin/groot/commit/b0a391b85274ab8cf2f6837b8dda4dadf6f716a1) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Truncate job IDs in the jobs list and toasts

  Job IDs are now shown truncated to 6 characters in the jobs list, and
  the same `formatJobId` helper is reused for job IDs in toasts so the
  short form is consistent everywhere a job is referenced.

- Updated dependencies [[`b0a391b`](https://github.com/AshikNesin/groot/commit/b0a391b85274ab8cf2f6837b8dda4dadf6f716a1), [`b0a391b`](https://github.com/AshikNesin/groot/commit/b0a391b85274ab8cf2f6837b8dda4dadf6f716a1), [`b0a391b`](https://github.com/AshikNesin/groot/commit/b0a391b85274ab8cf2f6837b8dda4dadf6f716a1)]:
  - @groot/ui@0.2.1
  - @groot/shell@0.5.0
  - @groot/core@0.7.1

## 0.6.1

### Patch Changes

- [`986c902`](https://github.com/AshikNesin/groot/commit/986c9024f0f5a106a4a8822b96605c8ef9eee225) Thanks [@AshikNesin](https://github.com/AshikNesin)! - fix(jobs): completed jobs and job types not visible on SQLite (honker)

  Two bugs in the honker (SQLite) adapter made the jobs dashboard lose parity
  with the Postgres (pg-boss) engine:

  1. **Completed jobs vanished.** `job.ack()` calls honker's `honker_ack()`,
     which DELETEs the row from `_honker_live`. pg-boss keeps completed jobs with
     `state='completed'` so the dashboard can list them. The adapter now marks
     the job `state='done'` in-place via SQL UPDATE (with a `worker_id` + claim
     guard to avoid races) instead of deleting it.

  2. **Completed/expired/cancelled state filters returned nothing.** The state
     filter queries had inline ternaries mapping `created`→`pending` and
     `active`→`processing`, but were missing `completed`→`done` (and
     `failed`→`dead`). Even if completed jobs existed, `WHERE state='completed'`
     matched nothing. Extracted a proper `toHonkerState()` reverse-mapping used
     by `getJobsByState`, `getJobs`, and `purgeJobsByState`.

  3. **"Add Job" dropdown was empty.** `getAvailableQueues()` only returns queues
     with rows currently in `_honker_live`. On a fresh database (or after
     purging), no job types appeared even though handlers were registered.
     `queries.getAvailableQueues()` now returns the union of adapter queues and
     registered handlers (`getRegisteredHandlers()`), which is the source of
     truth for triggerable job types.

## 0.6.0

### Minor Changes

- [#77](https://github.com/AshikNesin/groot/pull/77) [`e0d78f5`](https://github.com/AshikNesin/groot/commit/e0d78f5d17c27df512cd53ec20277ffdc9cf19bb) Thanks [@exe-dev-github-integration](https://github.com/apps/exe-dev-github-integration)! - feat: dual database engines (SQLite default, PostgreSQL opt-in) + job-queue adapter

  The boilerplate now runs on **SQLite by default** and **PostgreSQL as an opt-in**
  via `DATABASE_ENGINE`, with the background job queue running on a matching
  engine-specific adapter. Application code is engine-agnostic.

  ## @groot/core

  - **Engine selection.** `DATABASE_ENGINE=sqlite` (default) uses
    [better-sqlite3](https://github.com/WiseLibs/better-sqlite3);
    `DATABASE_ENGINE=postgres` uses PostgreSQL via `@prisma/adapter-pg`. The
    driver adapter, the KV backend, and the job queue are all selected by this
    single switch.
  - **Two Prisma schemas kept in parity.** `apps/web/prisma/schema.sqlite.prisma`
    and `apps/web/prisma/schema.postgres.prisma` (Prisma requires a literal
    `provider`). A unit test (`tests/server/prisma/schema-parity.test.ts`)
    guards that the two stay in sync.
  - **`Json` columns on both engines.** Array/JSON fields use Prisma's `Json`
    type — native `JSONB` on Postgres, `TEXT` on SQLite — so the generated client
    types are identical (`runtime.JsonValue`) and there is zero app-code
    branching.
  - **KV backend follows the engine.** Keyv now uses `@keyv/sqlite` on SQLite
    and `@keyv/postgres` on Postgres (was Postgres-only).
  - **Generated client is engine-specific.** The generated Prisma client embeds
    the datasource provider, so switching engines requires regenerating it.
    `pnpm dev` / `pnpm test` (via the `pretest` hook) now regenerate for the
    active engine.

  ## @groot/jobs

  - **Job-queue adapter pattern.** A new `JobQueueAdapter` interface
    (`packages/jobs/src/server/adapter.ts`) captures the operations the rest of
    `@groot/jobs` needs. `client.ts` picks the implementation by engine:
    - **Postgres** → `PgBossAdapter` wraps [pg-boss](https://github.com/timgit/pg-boss).
    - **SQLite** → `HonkerAdapter` wraps
      [`@russellthehippo/honker-node`](https://github.com/russellromney/honker), a
      durable SQLite-backed queue with retries, visibility timeouts, dead-letter
      rows, and cron scheduling.
  - **Normalized job shape.** Both adapters return jobs in a shared `QueueJob`
    shape; feature handlers take a `JobContext<T>`. No `pg-boss` import remains in
    app code, and the dashboard is engine-agnostic.
  - New dependency: `@russellthehippo/honker-node` (SQLite engine only).

  ## groot (app)

  - **SQLite is the default engine.** `DATABASE_ENGINE` defaults to `sqlite`;
    set `DATABASE_ENGINE=postgres` to opt into PostgreSQL.
  - **Dual-engine CI.** `.github/workflows/test.yml` runs the full suite
    (typecheck, lint, test, build) on both engines via a matrix — Postgres leg
    uses a `pgvector/pgvector:pg18` service container. Convenience scripts:
    `pnpm test:sqlite`, `pnpm test:postgres`, `pnpm test:all`.
  - **Build.** Native modules (`better-sqlite3`, `sqlite3`, `pg`,
    `@russellthehippo/honker-node` + platform packages) are externalized in
    `scripts/build.mjs`.
  - **Docs.** New `docs/database-engines.md`; setup, quick-start, architecture,
    jobs, KV, testing, and migration guides updated for both engines.

  See `docs/database-engines.md` for the full engine matrix, the `Json` parity
  strategy, honker specifics, and migration/build gotchas.

### Patch Changes

- Updated dependencies [[`e0d78f5`](https://github.com/AshikNesin/groot/commit/e0d78f5d17c27df512cd53ec20277ffdc9cf19bb)]:
  - @groot/core@0.7.0

## 0.5.2

### Patch Changes

- [#73](https://github.com/AshikNesin/groot/pull/73) [`40eb1ec`](https://github.com/AshikNesin/groot/commit/40eb1ece15b0b3c299b32f12763f2c7be4ff25d0) Thanks [@exe-dev-github-integration](https://github.com/apps/exe-dev-github-integration)! - perf: reduce memory and connection overhead in job queue

  - **PgBoss connection pool**: explicitly capped at `max=3` connections (`idleTimeoutMillis=30s`, `connectionTimeoutMillis=5s`). Previously used pg's default of `max=10`, creating up to 10 idle connections for background-job polling that needs at most 2-3.
  - **Job logger**: reuse a single module-level `pino-pretty` stream instance across all job executions instead of allocating a new `Transform` + `SonicBoom` writer on every job run.

- Updated dependencies [[`40eb1ec`](https://github.com/AshikNesin/groot/commit/40eb1ece15b0b3c299b32f12763f2c7be4ff25d0), [`1e85141`](https://github.com/AshikNesin/groot/commit/1e851410f1b5cdce9a6bcafd269da4f091c99245), [`225280b`](https://github.com/AshikNesin/groot/commit/225280b0899784e6fd92a363adb141dc7647bd24)]:
  - @groot/core@0.6.1
  - @groot/shell@0.4.0

## 0.5.1

### Patch Changes

- Updated dependencies [[`86c1657`](https://github.com/AshikNesin/groot/commit/86c165721799f81f001ea8f3c986ffc984551b4e)]:
  - @groot/core@0.6.0

## 0.5.0

### Minor Changes

- [#69](https://github.com/AshikNesin/groot/pull/69) [`0c47508`](https://github.com/AshikNesin/groot/commit/0c47508c31623b46f051257048c19f7c86c89e2b) Thanks [@AshikNesin](https://github.com/AshikNesin)! - refactor(core): migrate backend validation from middleware to strictly-typed controller helpers

  Replaced the `validateBody`, `validateQuery`, and `validateParams` Express middlewares with inline controller helpers `parseBody`, `parseQuery`, and `parseParams`. This change improves type safety by directly leveraging `z.output<typeof Schema>` inside the controllers, eliminating the need for unsafe `as T` casting.

  - The `req.validated` property has been removed from the Express Request type.
  - All core and shared feature modules (auth, passkey, storage, jobs, settings) have been migrated.

### Patch Changes

- Updated dependencies [[`0c47508`](https://github.com/AshikNesin/groot/commit/0c47508c31623b46f051257048c19f7c86c89e2b)]:
  - @groot/core@0.5.0

## 0.4.1

### Patch Changes

- [`5f9eddd`](https://github.com/AshikNesin/groot/commit/5f9eddd7bba05222c378578a7d0900dac53d52a2) Thanks [@AshikNesin](https://github.com/AshikNesin)! - refactor: unify cross-package imports on @groot/\* aliases

  Standardizes import style so cross-directory imports always use the
  package alias (`@groot/core/*`, `@groot/shell/*`, `@groot/jobs/*`) while
  same-directory imports stay relative (`./`). Previously these were mixed —
  even within a single file (e.g. `../kv` next to `@groot/core/logger`) —
  making import style inconsistent across the codebase.

  ## @groot/core

  - Converted all cross-directory `../` imports to `@groot/core/*` aliases
    across `ai`, `auth`, `config`, `kv`, `middlewares`, `notification`,
    `passkey`, `settings`, `storage`, and `utils`.
  - Same-directory `./` imports left unchanged.
  - Prisma `../../generated/prisma/client` imports in `database/` kept
    relative (no alias maps to the generated output outside `src/`).

  ## @groot/shell

  - Converted cross-directory `../` imports to `@groot/shell/*` aliases
    across `components`, `hooks`, `lib`, `pages/storage`, `services`, and
    `store`.

  ## @groot/jobs

  - Converted cross-directory `../` imports to `@groot/jobs/client/*`
    aliases across the client `components/`.

- Updated dependencies [[`5f9eddd`](https://github.com/AshikNesin/groot/commit/5f9eddd7bba05222c378578a7d0900dac53d52a2)]:
  - @groot/core@0.4.1
  - @groot/shell@0.3.1

## 0.4.0

### Minor Changes

- [`83b3a6f`](https://github.com/AshikNesin/groot/commit/83b3a6f1ce34a28299b00f18645faabf3e9569a8) Thanks [@AshikNesin](https://github.com/AshikNesin)! - refactor: unify API client, form handling, and server response flow

  A cross-cutting refactor of how the frontend talks to the API and how
  controllers shape responses, plus a shared Form primitive.

  ## @groot/core

  - Removed the `*System` namespace barrels (`AISystem`, `AuthSystem`,
    `ErrorSystem`, `KVSystem`, plus the passkey/settings/storage equivalents).
    Callers now use direct named imports instead of convenience namespaces.
  - Added `utils/controller.utils.ts` with `requireUser(req)` and
    `validatedBody<T>(req)` helpers, replacing repeated inline `req.user` /
    `req.body as` boilerplate across controllers.
  - Added `utils/api-response.utils.ts` to standardize controller response
    shapes.
  - Extracted shared Zod field shapes (`emailField`, `passwordField`) in
    `auth.validation.ts` so the client can reuse them for form validation
    (single source of truth).
  - Streamlined `error-handler`, `error-response`, `route-handler`, and
    `validation` middlewares.

  ## @groot/ui

  - Added a `Form` component (`form.tsx`) with `react-hook-form` integration and
    field helpers.

  ## @groot/shell

  - Reworked `lib/api.ts` (the `apiClient`) for simpler, more consistent request
    handling.
  - Added `useToastMutation` hook to standardize mutation + toast feedback.
  - Refactored `Login`, storage dialogs (`CreateFolderDialog`, `RenameDialog`),
    `PasskeyManager`, `AppSettings`, and the `useStorage` / `useAppSettings`
    hooks to build on the new Form component and apiClient.

  ## @groot/jobs

  - Refactored the client API layer (`api.ts`), `useJobs`, `useJobDetail`, and
    `JobsTable` to align with the new apiClient patterns.

### Patch Changes

- Updated dependencies [[`83b3a6f`](https://github.com/AshikNesin/groot/commit/83b3a6f1ce34a28299b00f18645faabf3e9569a8)]:
  - @groot/core@0.4.0
  - @groot/ui@0.2.0
  - @groot/shell@0.3.0

## 0.3.0

### Minor Changes

- [#64](https://github.com/AshikNesin/groot/pull/64) [`ae54b49`](https://github.com/AshikNesin/groot/commit/ae54b4920f39b2dbd9432298855210cb4752cd57) Thanks [@AshikNesin](https://github.com/AshikNesin)! - refactor: reorganize codebase architecture

  - Flattened the `packages/` directory, merging `server`, `logger`, and `database` into `core`.
  - Renamed `client` to `shell`.
  - Moved boilerplate `auth`, `settings`, and `storage` modules out of `apps/web/src/client/pages` and into `@groot/shell`.
  - Replaced all legacy paths with their new equivalents in all codebase documentation, tests, and comments.

### Patch Changes

- Updated dependencies [[`ae54b49`](https://github.com/AshikNesin/groot/commit/ae54b4920f39b2dbd9432298855210cb4752cd57)]:
  - @groot/core@0.3.0
  - @groot/shell@0.2.0
  - @groot/ui@0.1.0

## 0.2.0

### Minor Changes

- [`07de4af`](https://github.com/AshikNesin/groot/commit/07de4afce92948ac8a657284548d21fb7a670910) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Extract logger into a dedicated `@groot/core/logger` package

  The Pino logger module moves out of `@groot/core/core/logger/` into its own
  flat `@groot/core/logger` package (mirrors `@groot/core/database` as a leaf). This removes
  the `@groot/jobs` → `@groot/core` reach-through for logger exports and gives
  foundational infrastructure its own package boundary.

  **Breaking — migration required for downstream repos:**

  - All `@groot/core/core/logger` imports must move to `@groot/core/logger`. Affected
    surfaces: server middlewares, kv store, shared services, the jobs backend,
    the app bootstrap, and tests that `vi.mock` the logger.
  - The logger no longer reads `env`/`config` eagerly. The server bootstrap must
    call `configureLogger({ level, service, nodeEnv })` once before request
    handling — `apps/web/src/server/index.ts` now does this as the first statement
    in `main()`:
    ```ts
    import { configureLogger } from "@groot/core/logger";
    configureLogger({
      level: config.logging.level,
      service: config.app.name,
      nodeEnv: env.NODE_ENV,
    });
    ```
    This preserves the `config.logging.level` / `config.app.name` YAML knobs.
  - `loggerConfig` / `logLevel` are now live bindings updated by `configureLogger`
    (read them at runtime, not import time). `isDevelopment` reads `process.env.NODE_ENV`
    directly (equivalent to the previous `env.NODE_ENV`).

  Notes:

  - `@groot/core/logger` is a leaf (deps: `pino`, `pino-pretty`, `dayjs`; `@types/express`/`@types/node` dev). No `@groot/*` deps.
  - `@groot/core`, `@groot/jobs`, and `apps/web` now declare `@groot/core/logger` as a workspace dependency.
  - `@groot/core` no longer contains the logger module; the `packages/core/src/logger/` directory is removed.
  - Configured via the esbuild/vitest/tsconfig `@groot/core/logger` alias.

### Patch Changes

- Updated dependencies [[`07de4af`](https://github.com/AshikNesin/groot/commit/07de4afce92948ac8a657284548d21fb7a670910)]:
  - @groot/core@0.2.0
  - @groot/core/logger@0.1.0

## 0.1.0

### Minor Changes

- [#60](https://github.com/AshikNesin/groot/pull/60) [`0473401`](https://github.com/AshikNesin/groot/commit/0473401aacc5ccd4e67e8def92e98b30ecd72a9a) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Extract all jobs code into a dedicated `@groot/jobs` package

  The entire jobs vertical — pg-boss backend infrastructure, HTTP admin API,
  job logger, the dashboard UI, client types, and API methods — now lives in a
  single `@groot/jobs` package with two flat entry points:

  - `@groot/jobs/server/*` — pg-boss queue/worker/queries, routes, job logger
  - `@groot/jobs/client/*` — dashboard UI, `jobsApi`, types

  Business-specific handlers (`todo.jobs.ts`) and bootstrap wiring stay in
  `apps/web/`. This consolidates jobs code that was previously spread across
  `@groot/core` (`core/job`, `shared/jobs`, `core/logger`), `@groot/shell`
  (`types/jobs`, apiClient methods), and `apps/web` (dashboard UI).

  **Breaking — migration required for downstream repos:**

  - `createJobLogger` / `JobLogStream` / `createJobLogStream` moved from
    `@groot/core/core/logger` → `@groot/jobs/server/logger`. The
    `@groot/core/core/logger` re-exports are removed.
  - The 17 job methods were removed from `apiClient` (`@groot/shell/lib/api`).
    Use `jobsApi` from `@groot/jobs/client` instead.
  - `JobName` changed from an enum (with hardcoded `TODO_*` values) to
    `type JobName = string`. App-specific job names live with their handlers.
  - Server-side imports of job infra must move from
    `@groot/core/core/job/*` and `@groot/core/shared/jobs/*` to
    `@groot/jobs/server/*` (use explicit subpaths like `/worker`, `/logger`,
    `/routes` for the server bundle).
  - The jobs dashboard UI moved from `apps/web/src/client/pages/jobs/` to
    `@groot/jobs/client`. Import pages via `@groot/jobs/client`.

  The `database → logger → job-stream → database` module cycle is resolved as
  a side effect (job-stream left `@groot/core/core/logger`). `pg-boss` is no
  longer a dependency of `@groot/core` (it now lives in `@groot/jobs`).

### Patch Changes

- Updated dependencies [[`0473401`](https://github.com/AshikNesin/groot/commit/0473401aacc5ccd4e67e8def92e98b30ecd72a9a)]:
  - @groot/core@0.1.0
  - @groot/shell@0.1.0
