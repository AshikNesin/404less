# @groot/ui

## 0.8.0

### Minor Changes

- [#140](https://github.com/AshikNesin/groot/pull/140) [`68254db`](https://github.com/AshikNesin/groot/commit/68254db6c9f7f4378a93cb8f5c89746877295bb2) Thanks [@AshikNesin](https://github.com/AshikNesin)! - New default look: a warm monochrome theme, ported from tiny-agents, applied consistently across every primitive and page. Every app that syncs `packages/**` picks it up, so review your pages after syncing. The rules are in `docs/features/dls.md` ("Shape and size").

  - **Theme tokens** (`@groot/shell` `index.css`): off-white / near-black surfaces with a faint warm cast, foreground-derived hairline borders, an achromatic primary, and a larger `--radius` (0.75rem). In dark mode `--muted` and `--secondary` sit one step above `--card`, so hover and selected fills show on cards. The sidebar tokens now hold real values (the sidebar uses them). Each theme sets `color-scheme`, the body uses `100dvh`, and scrollbars get a quiet thumb. CodeMirror's background, gutter and active line follow the tokens.
  - **One control scale** (`@groot/ui`): `Button`, `Input`, `SelectTrigger`, `InputGroup` and `TabsList` share heights (`sm` h-7, default h-9, `lg` h-10) and are `rounded-xl` at every size. `Button` default is h-9, `lg` h-10, `icon` size-9, `icon-lg` size-10; `Input` and `InputGroup` are h-9. Outline buttons are transparent, so they take the surface they sit on.
  - **Surfaces**: `Card` `rounded-2xl`. `Dialog` and `AlertDialog` (and so `useConfirm`) are viewport-capped flex columns, `rounded-3xl` with `p-6`, over a `bg-black/40` backdrop without blur; their footers drop the grey band and negative margins, so drop any compensating spacing. New `DialogBody` scrolls tall content between a pinned header and footer. Dropdown menus and the select menu are `rounded-xl` with `rounded-lg`, roomier items; the command palette uses the dialog radius; tooltips `rounded-lg`; `Alert` `rounded-xl`; toasts `rounded-xl`.
  - **Toasts follow the theme**: `Toaster` reads the `dark` class on `<html>`, so rich-color toasts are no longer light on a dark page.
  - **Contrast**: destructive text on `Badge` and `StatusBadge` mixes in the foreground so it reaches 4.5:1 on its red tint.
  - `GrootUIProvider` takes a `toaster` prop (sonner `ToasterProps`, e.g. `position`).
  - **Shell chrome**: `SidebarNav` uses the sidebar tokens, a hairline border and `h-9 rounded-xl` rows; the collapsed rail now keeps search and the account menu. The page background is `bg-background` instead of `bg-muted/40`, and the mobile top bar is opaque. Settings search, list rows, the new-setting form and the JSON editor frame follow the control scale; the storage table frame matches `Card`. `ThemeMenu` is exported from `@groot/shell/components/Layout`.
  - **`@groot/jobs`**: page-header and job-detail actions use the default size; the filter toolbar (tabs, search, Queue, Date) is one height; the job type picker looks like a select; job dialogs scroll their forms in `DialogBody`; JSON, log and error blocks are `rounded-xl`.

## 0.7.3

### Patch Changes

- [`6209997`](https://github.com/AshikNesin/groot/commit/620999778ed329ee20b55f810f80b368db158dd4) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Select: the menu gets `p-1` on its viewport (it sat on `SelectGroup`, so ungrouped items touched the menu's edge), triggers default to `w-full` instead of `w-fit` so they match the inputs beside them (pass a width class, e.g. `w-fit`, for compact triggers), and the menu aligns to the trigger's start edge instead of centring.

- [`8ab9eee`](https://github.com/AshikNesin/groot/commit/8ab9eeee9b3029330f8f70d06e6cf31b3f3eb42f) Thanks [@AshikNesin](https://github.com/AshikNesin)! - `SelectContent` now defaults to `position="popper"`, a dropdown anchored below the trigger and at least as wide as it. The previous default, Radix's `"item-aligned"`, opened the list on top of the trigger, covering the selected value and the fields around it. Pass `position="item-aligned"` to keep the old behaviour.

## 0.7.2

### Patch Changes

- [`aba55a5`](https://github.com/AshikNesin/groot/commit/aba55a5205f5c05137f1203af639f8b2e5dcd108) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Login and auth UX fixes from a production friction audit:

  - Login failure toast maps 401 to "Invalid email or password." instead of surfacing the raw Axios message ("Request failed with status code 401"); network failures get a friendly line too. Same for passkey sign-in.
  - Logout from the user menu shows a "Signed out" toast.
  - The login page's right brand panel follows dark mode (`dark:bg-card`) instead of rendering a pure-white slab next to the dark form.
  - Dropdown submenus open with a small `sideOffset` so they no longer overlap their parent menu.

  - The command palette now closes on outside click / overlay tap (it opted
    into `dismissOnOutsideClick`); previously only Escape or running a
    command dismissed it.

## 0.7.1

### Patch Changes

- [#123](https://github.com/AshikNesin/groot/pull/123) [`297f957`](https://github.com/AshikNesin/groot/commit/297f957bc0fcda60dcb63deb770bda7860e92b7e) Thanks [@exe-dev-github-integration](https://github.com/apps/exe-dev-github-integration)! - Complete the typecheck graph: add a client typecheck script and CI step, and a coverage guard that fails when a source file belongs to no checked project. Repo-owned `.d.ts` files under the covered roots are typechecked in a dedicated skipLibCheck:false pass instead of counting toward coverage unchecked. The two live fixes touch kit source: the jobs client re-export path in `packages/jobs/src/client/types.ts`, the `cn` import in `packages/shell/src/components/PasskeyManager.tsx`, and the tooltip entry added to the `packages/ui/src/index.ts` barrel (tooltip.tsx existed since e997f40 but was never exported from the barrel before this PR), so the three kit packages carry the same patch as the root.

- [#127](https://github.com/AshikNesin/groot/pull/127) [`73677b0`](https://github.com/AshikNesin/groot/commit/73677b01da2163aca4d8c78c35f637b124a58b5e) Thanks [@exe-dev-github-integration](https://github.com/apps/exe-dev-github-integration)! - Add a compiled consumer fixture for the shipped kit surface, an explicit exports map for @groot/ui and @groot/jobs, and a guard that fails when the map and the fixture drift.

## 0.7.0

### Minor Changes

- [`960a9c1`](https://github.com/AshikNesin/groot/commit/960a9c15e059e49b2edcfb837875c9efc399190d) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Add DLS composition components: DataField/DataFields, StatTile, listRowClass

  Ships the recurring higher-order patterns the DLS audit found hand-rolled across groot and the child projects (nesins-finance-api alone had 9 files of drifting dt/dd display fields; list-row hover treatments appeared in 86 child files).

  - `@groot/ui/display` (new): `DataField` (label/value pair, `dt`/`dd`, meta-label typography) + `DataFields` (responsive 2→4 col grid wrapper). The display counterpart to form-`Field` from `@groot/ui/form`.
  - `@groot/ui/stat-tile` (new): `StatTile` — meta label + optional icon + `statClass` value, with a clickable/active variant for filter-stats (JobsStats' pattern).
  - `@groot/ui/list-row` (new): `listRowClass` / `listRowGridClass` — the interactive list-row treatments as class constants (`tableColumnHeaderClass` precedent; rows stay semantic elements). Unblocks child projects against the new transition-colors gate rule on next sync.
  - Consumers reconciled: JobOverview (local `Field` deleted), JobDetail singleton section, JobsStats (inline tile → `StatTile`), JobsTable (both row variants), ScheduledJobsPanel, Todos, PasskeyManager.
  - Docs: `docs/features/dls.md` gains a composition-components section (with the pull-don't-push doctrine); `docs/features/client.md` rules table extended.

### Patch Changes

- [`e95a091`](https://github.com/AshikNesin/groot/commit/e95a09100a8459eab096df4d414ba081d8454112) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Introduce the DLS: a closed type scale, Kumo-adapted rules, and enforcement

  Establishes the repo's Design Language System as a written spec plus enforced rules — built on the existing stack (Tailwind v4 + Radix/shadcn + cva), with Cloudflare's Kumo as reference, not dependency.

  - `@groot/ui/typography` (new): `Text` component + exported classes — `titleClass`, `h1Class`, `statClass`, `displayClass`, `monoClass`, `metaLabelClass`. The type scale is now closed; pages never pick `text-*` sizes ad hoc. `tableColumnHeaderClass` now equals `metaLabelClass` (one definition of the meta-label idiom).
  - 4 new gate rules in `scripts/check-design-tokens.ts` (9 total): `tracking-modified` (no `tracking-*`, except `metaLabelClass`), `font-bold` (banned; `font-semibold` is max), `transition-colors-hover` (instant color hover in pages; primitives exempt as the motion layer), `inline-mono-full-step` (inline mono at `text-[0.9em]`). `allow` lists now support directory-prefix entries.
  - Drift reconciled: `tracking-tight` removed from 8 headings; local meta-label copies in jobs → `tableColumnHeaderClass`; inline `font-mono text-sm` → `text-[0.9em]`; `transition-colors/all` removed from 18 page/shell sites (primitives keep theirs). Login h1 uses `h1Class`; marketing h2 uses `displayClass`.
  - Docs: `docs/features/dls.md` (spec + rationale + rejected alternatives); rules table extended in `docs/features/client.md`; AGENTS.md index link.
  - Agent skill: `.agents/skills/groot-dls/SKILL.md` — the distilled non-negotiables for AI sessions.

## 0.6.0

### Minor Changes

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

## 0.5.0

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

## 0.4.0

### Minor Changes

- [`399ee35`](https://github.com/AshikNesin/groot/commit/399ee35d36a4bae5fcd3df68b481170d6f68da53) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Add the missing state primitives and converge the badge/table surfaces so pages stop hand-rolling them.

  - **New `EmptyState` / `ErrorState`** — one canonical icon + title + description + action shape, replacing the six divergent empty/error stacks that had grown across Todos, Jobs, Storage, Settings, and Passkeys.
  - **`LoadingState`** now accepts `size` and `className`, so surfaces needing a fixed height (e.g. `h-96` inside a card) can use it instead of wrapping `LoadingSpinner` in a bespoke box.
  - **`StatusBadge` is now built on `Badge`**, inheriting its pill shape and typography. It previously rendered as an unrounded rectangle at `text-[11px]`, so the same semantic looked different depending on which component a page reached for. Status pills change appearance slightly as a result.
  - **`Table` now matches the app's real table density** (`px-4 py-3` cells, `px-4 py-2.5` heads) and `TableHead` applies the shared uppercase column-header style. The new **`tableColumnHeaderClass`** export lets grid-based tables (whose rows are links, so they can't use `<th>`) share that exact token instead of redeclaring it locally.
  - `LoadingSpinner` uses `size-*` shorthand.
  - **New generic skeleton family** — `SkeletonCard` (title bar + body lines, or a custom body via `children`), `SkeletonList` (rows with optional leading block, secondary line, trailing pill), and `SkeletonTable` (header band + per-column bars) join the base `Skeleton`. Pages compose these instead of defining per-page skeleton components. **Breaking-ish:** the old `SkeletonList` variant API (`count`/`variant` with hardcoded TableRow/Card/ListItem/Text shapes) is replaced by the new row-oriented props (`rows`/`leading`/`secondaryLine`/`trailing`); it had no consumers in this repo.

## 0.3.0

### Minor Changes

- [#103](https://github.com/AshikNesin/groot/pull/103) [`90c30e0`](https://github.com/AshikNesin/groot/commit/90c30e02b09c3e355bd8a0aa0f431006dd55431b) Thanks [@exe-dev-github-integration](https://github.com/apps/exe-dev-github-integration)! - Add `GrootUIProvider` — a single root provider composing `ConfirmProvider` and the `Toaster`. App authors now mount one `<GrootUIProvider>` instead of remembering to wire up each cross-cutting UI provider individually (previously a hidden, transitive requirement for any consumer of `useConfirm()`). The individual exports remain available for callers that need finer control.

## 0.2.2

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

## 0.2.1

### Patch Changes

- [`b0a391b`](https://github.com/AshikNesin/groot/commit/b0a391b85274ab8cf2f6837b8dda4dadf6f716a1) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Improve form field spacing and consistency

  The shared `form.tsx` primitives now apply more consistent spacing
  between fields. Updated the job dialogs (Add/Edit/Schedule) and
  AppSettings form to use the improved form components for uniform
  vertical rhythm across forms.

## 0.2.0

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

## 0.1.0

### Minor Changes

- [#64](https://github.com/AshikNesin/groot/pull/64) [`ae54b49`](https://github.com/AshikNesin/groot/commit/ae54b4920f39b2dbd9432298855210cb4752cd57) Thanks [@AshikNesin](https://github.com/AshikNesin)! - refactor: reorganize codebase architecture

  - Flattened the `packages/` directory, merging `server`, `logger`, and `database` into `core`.
  - Renamed `client` to `shell`.
  - Moved boilerplate `auth`, `settings`, and `storage` modules out of `apps/web/src/client/pages` and into `@groot/shell`.
  - Replaced all legacy paths with their new equivalents in all codebase documentation, tests, and comments.
