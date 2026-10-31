# @groot/shell

## 1.1.0

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

### Patch Changes

- Updated dependencies [[`68254db`](https://github.com/AshikNesin/groot/commit/68254db6c9f7f4378a93cb8f5c89746877295bb2)]:
  - @groot/ui@0.8.0

## 1.0.0

### Major Changes

- [#135](https://github.com/AshikNesin/groot/pull/135) [`6002a46`](https://github.com/AshikNesin/groot/commit/6002a46dabe53ab067472cfa03862d18e1d9fcdc) Thanks [@AshikNesin](https://github.com/AshikNesin)! - **@groot/shell:** the API client is now plain `fetch`; axios is gone. `apiClient.client` (the axios instance) no longer exists, and failed requests throw `ApiError` (`status`, `code`, `details`, `url`) instead of an axios error. `error.message` still carries the server's message.

  **@groot/core:** `migrateD1()` applies Drizzle's generated SQL migrations to a D1 database from inside the Worker (wrangler-compatible `d1_migrations` bookkeeping), so the Workers entry migrates on its first request and `wrangler deploy` is the whole deploy. `pnpm db:generate` now also writes `apps/web/drizzle/index.ts`, the list the Worker imports. The unused `send-push-notification` dependency is dropped.

### Patch Changes

- [`c1e5177`](https://github.com/AshikNesin/groot/commit/c1e5177f72bce07990e72f6678a210b62005d472) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Fix the JSON editor crashing on mount with "Unrecognized extension value in extension set": pnpm overrides now keep one copy of each `@codemirror/*` core package (the root pinned `@codemirror/state` 6.7.0 while `@codemirror/view` resolved 6.7.1). Switch from `@tailwindcss/postcss` to `@tailwindcss/vite` so the Inter font files from `@fontsource-variable/inter` are bundled; under PostCSS their relative `url()`s never resolved and production served `index.html` in their place.

- [`191f6a6`](https://github.com/AshikNesin/groot/commit/191f6a6ea0efe632f8bf8fc3221f81ab01e9d0c9) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Fix the sidebar losing its layout after the switch to `@tailwindcss/vite`: that plugin scans for classes from Vite's root (`apps/web`), so classes used only in `packages/*` were dropped from the CSS. The shell stylesheet now sets Tailwind's source base back to the repo root.

- Updated dependencies [[`6209997`](https://github.com/AshikNesin/groot/commit/620999778ed329ee20b55f810f80b368db158dd4), [`8ab9eee`](https://github.com/AshikNesin/groot/commit/8ab9eeee9b3029330f8f70d06e6cf31b3f3eb42f)]:
  - @groot/ui@0.7.3

## 0.11.0

### Minor Changes

- [`72ce54c`](https://github.com/AshikNesin/groot/commit/72ce54c32d03c89018fddb5487b4b64662953d2c) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Add ShellProvider so apps can override shared shell branding and login marketing copy without modifying synced shell components.

### Patch Changes

- [`aba55a5`](https://github.com/AshikNesin/groot/commit/aba55a5205f5c05137f1203af639f8b2e5dcd108) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Login and auth UX fixes from a production friction audit:

  - Login failure toast maps 401 to "Invalid email or password." instead of surfacing the raw Axios message ("Request failed with status code 401"); network failures get a friendly line too. Same for passkey sign-in.
  - Logout from the user menu shows a "Signed out" toast.
  - The login page's right brand panel follows dark mode (`dark:bg-card`) instead of rendering a pure-white slab next to the dark form.
  - Dropdown submenus open with a small `sideOffset` so they no longer overlap their parent menu.

  - The command palette now closes on outside click / overlay tap (it opted
    into `dismissOnOutsideClick`); previously only Escape or running a
    command dismissed it.

- [`7b86607`](https://github.com/AshikNesin/groot/commit/7b86607a4147a66373e1e5c3b8457d81e25a50e6) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Add a passkey sign-in option to the login page.

- [#132](https://github.com/AshikNesin/groot/pull/132) [`664f989`](https://github.com/AshikNesin/groot/commit/664f989db27179fd61059a1002506c27c8264023) Thanks [@exe-dev-github-integration](https://github.com/apps/exe-dev-github-integration)! - Import `Settings`'s `PageLayout` from the case-safe `@groot/shell/components/layout/index` barrel instead of the deep file. 129a729 fixed a macOS case-collision (bare `@groot/shell/components/layout` resolves to `components/Layout.tsx`) by moving the last two barrel importers to deep paths, which dropped the `layout/index.ts` barrel from every typechecked program and turned the typecheck-coverage guard red (`183/184`). The barrel is documented public kit surface (docs/guides/development.md), so it stays shipped and re-enters the typecheck graph through a real import.

- [`e3614e4`](https://github.com/AshikNesin/groot/commit/e3614e4bce049f0cb71ee28bcb24cfeed05fd110) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Add persisted light, dark, and system theme preferences across the shell.

- Updated dependencies [[`aba55a5`](https://github.com/AshikNesin/groot/commit/aba55a5205f5c05137f1203af639f8b2e5dcd108)]:
  - @groot/ui@0.7.2

## 0.10.3

### Patch Changes

- [#123](https://github.com/AshikNesin/groot/pull/123) [`297f957`](https://github.com/AshikNesin/groot/commit/297f957bc0fcda60dcb63deb770bda7860e92b7e) Thanks [@exe-dev-github-integration](https://github.com/apps/exe-dev-github-integration)! - Complete the typecheck graph: add a client typecheck script and CI step, and a coverage guard that fails when a source file belongs to no checked project. Repo-owned `.d.ts` files under the covered roots are typechecked in a dedicated skipLibCheck:false pass instead of counting toward coverage unchecked. The two live fixes touch kit source: the jobs client re-export path in `packages/jobs/src/client/types.ts`, the `cn` import in `packages/shell/src/components/PasskeyManager.tsx`, and the tooltip entry added to the `packages/ui/src/index.ts` barrel (tooltip.tsx existed since e997f40 but was never exported from the barrel before this PR), so the three kit packages carry the same patch as the root.

- Updated dependencies [[`297f957`](https://github.com/AshikNesin/groot/commit/297f957bc0fcda60dcb63deb770bda7860e92b7e), [`73677b0`](https://github.com/AshikNesin/groot/commit/73677b01da2163aca4d8c78c35f637b124a58b5e)]:
  - @groot/ui@0.7.1

## 0.10.2

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

- Updated dependencies [[`960a9c1`](https://github.com/AshikNesin/groot/commit/960a9c15e059e49b2edcfb837875c9efc399190d), [`e95a091`](https://github.com/AshikNesin/groot/commit/e95a09100a8459eab096df4d414ba081d8454112)]:
  - @groot/ui@0.7.0

## 0.10.1

### Patch Changes

- Updated dependencies [[`9e5602a`](https://github.com/AshikNesin/groot/commit/9e5602a68d11df36357165df982f71cb8d6c2a79)]:
  - @groot/ui@0.6.0

## 0.10.0

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

- Updated dependencies [[`18e3200`](https://github.com/AshikNesin/groot/commit/18e3200e3a34db550672c49aa2c5683a4f261b11)]:
  - @groot/ui@0.5.0

## 0.9.1

### Patch Changes

- [`d03042b`](https://github.com/AshikNesin/groot/commit/d03042b6798461138fccb5d1881b2f9e80521153) Thanks [@AshikNesin](https://github.com/AshikNesin)! - feat: render job-data links inline within the JSON view

  Replaces the separate Structured/JSON toggle in `JobJsonBlock` with a single
  read-only JSON panel that highlights resolver-matched values as clickable
  links. Link ranges are computed while pretty-printing (`stringifyWithLinks`)
  and rendered as CodeMirror decorations that navigate on click.

  - `JobJsonBlock` no longer toggles between `JobDataView` and raw JSON; it always
    shows JSON with inline link highlights.
  - `CodeMirrorEditor` gains `linkRanges` and `onLinkClick` props to drive
    `Decoration.mark` ranges + click handling, plus a `.cm-json-link` style.

## 0.9.0

### Minor Changes

- [`399ee35`](https://github.com/AshikNesin/groot/commit/399ee35d36a4bae5fcd3df68b481170d6f68da53) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Make the page shell the single owner of page chrome, and adopt the shared primitives across shell pages.

  - **`PageHeader` / `PageLayout` gain `breadcrumb` and `titleAdornment` slots**, and `description` widens from `string` to `ReactNode`. Detail pages previously copy-pasted `PageHeader`'s `<h1>` classes because there was nowhere to put a breadcrumb trail or a status pill.
  - **`Section` gains `meta` and `actions` slots** and now renders a `text-sm` heading, matching the "label + count" pattern that pages were hand-rolling. It had no consumers before.
  - **`Storage` now renders through `PageLayout`**, dropping its own `max-w-7xl` container and `text-2xl font-medium` `<h1>` (which disagreed with every other page title). Its breadcrumb uses the `Breadcrumb` primitive and its file list uses `Table`/`TableRow`/`TableCell` instead of a raw `<table>`.
  - **`AppSettings` and `PasskeyManager` now use `Card`** instead of hand-rolled `rounded-xl border border-border bg-card` divs, so the Settings page no longer has visibly different card edges than the rest of the app (`Card` uses a ring, not a border).
  - **Destructive confirmations now use `useConfirm()`** in `AppSettings` and `PasskeyManager`, replacing two bespoke `Dialog`s that could be dismissed by an overlay click. `useAppSettings` no longer returns the now-unused `showDeleteDialog` / `setShowDeleteDialog` / `requestDelete`.
  - `ProtectedRoute` uses `LoadingSpinner` instead of a hand-rolled spinner div; redundant `mr-2` margins on icons inside gap-spaced menu items are removed.

### Patch Changes

- Updated dependencies [[`399ee35`](https://github.com/AshikNesin/groot/commit/399ee35d36a4bae5fcd3df68b481170d6f68da53)]:
  - @groot/ui@0.4.0

## 0.8.0

### Minor Changes

- [`c097350`](https://github.com/AshikNesin/groot/commit/c0973502ae2e731094876e05dcfc9b3db6b3ccfc) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Re-export `NavItem` from `Layout` so app consumers can import it from the same path they pass `navItems` to.

## 0.7.0

### Minor Changes

- [#105](https://github.com/AshikNesin/groot/pull/105) [`5efcd19`](https://github.com/AshikNesin/groot/commit/5efcd19c4d87de3afc47c32d8aae8fe2bd20e525) Thanks [@exe-dev-github-integration](https://github.com/apps/exe-dev-github-integration)! - Refine shell loading and hydration states: read the sidebar collapsed preference synchronously from `localStorage` (fixes the collapse flash on reload), give `<main>` a min-height for a stable footprint while content loads, and show a centered spinner during the initial auth check instead of a blank screen.

### Patch Changes

- [#107](https://github.com/AshikNesin/groot/pull/107) [`0051546`](https://github.com/AshikNesin/groot/commit/005154619ee39ca399a96bcea02ba0fbbcfd3e91) Thanks [@AshikNesin](https://github.com/AshikNesin)! - PageHeader actions now wrap on narrow viewports (fixes mobile overflow), and the vite client config dedupes its `@groot/*` alias list into a single const shared by the build and the test runner.

## 0.6.2

### Patch Changes

- Updated dependencies [[`90c30e0`](https://github.com/AshikNesin/groot/commit/90c30e02b09c3e355bd8a0aa0f431006dd55431b)]:
  - @groot/ui@0.3.0

## 0.6.1

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

## 0.6.0

### Minor Changes

- [#98](https://github.com/AshikNesin/groot/pull/98) [`b9906ec`](https://github.com/AshikNesin/groot/commit/b9906ec95ba2702d5f7f3176333e65be30a2ff8f) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Make the shell Layout/SidebarNav/CommandPalette/Storage app-configurable

  The shell app shell (Layout, SidebarNav, CommandPalette) and the Storage page
  now accept optional props so child apps can brand the shell and extend the
  command palette / user menu without forking the components. All new props are
  optional with defaults that preserve the existing groot behavior, so the
  boilerplate's own app is unchanged.

  - `Layout`: `navItems`, `brand`, `userMenuItems`, `commandGroups` props. The
    sidebar offset (`lg:pl-56`/`lg:pl-16`) and the mobile top bar are now gated
    on `header === undefined` so a custom header no longer double-pads the page.
    The footer user dropdown is driven by `userMenuItems` (default = the prior
    Storage/Jobs/Settings + Log out entries) and supports `to`/`href`/`onSelect`
    entries with optional separators and destructive styling.
  - `SidebarNav`: `NavItem.icon` accepts a `LucideIcon` directly (in addition to
    the existing string keys). New `brand` prop (`{ label, icon?, to? }`) replaces
    the hardcoded "Groot" label/logo.
  - `CommandPalette`: `CommandPaletteDialog({ groups })` accepts custom
    `CommandGroupEntry[]` (default = the prior Navigation + Account groups).
  - `Storage`: optional `onView?: (file: StorageFile) => void` lets an app
    intercept "View" clicks for an in-app viewer (falls back to the existing
    open-in-new-tab behavior). The bulk-upload input was wired but never
    triggered by any button (dead code); the single Upload input is now
    `multiple` and routes 1-file vs multi-file uploads internally.

## 0.5.0

### Minor Changes

- [`b0a391b`](https://github.com/AshikNesin/groot/commit/b0a391b85274ab8cf2f6837b8dda4dadf6f716a1) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Redesign settings UI with a dub-inspired card layout

  The Settings page, AppSettings, and PasskeyManager components have been
  reworked into a cleaner card-based layout inspired by Dub. The redundant
  desktop top toolbar in the Layout was also removed since the sidebar
  already provides navigation.

### Patch Changes

- [`b0a391b`](https://github.com/AshikNesin/groot/commit/b0a391b85274ab8cf2f6837b8dda4dadf6f716a1) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Improve form field spacing and consistency

  The shared `form.tsx` primitives now apply more consistent spacing
  between fields. Updated the job dialogs (Add/Edit/Schedule) and
  AppSettings form to use the improved form components for uniform
  vertical rhythm across forms.

- Updated dependencies [[`b0a391b`](https://github.com/AshikNesin/groot/commit/b0a391b85274ab8cf2f6837b8dda4dadf6f716a1)]:
  - @groot/ui@0.2.1

## 0.4.0

### Minor Changes

- [#74](https://github.com/AshikNesin/groot/pull/74) [`1e85141`](https://github.com/AshikNesin/groot/commit/1e851410f1b5cdce9a6bcafd269da4f091c99245) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Add `loginWithPasskey` to the shell auth store

  `useAuthStore` now exposes `loginWithPasskey(email?)`, which runs the WebAuthn
  ceremony via the existing `passkeyService.loginWithPasskey` and — on success —
  sets `isAuthenticated`/`user` and bumps `generation`, mirroring password login.

  Previously apps that wanted passkey login had to fork the store and track a
  separate `username` field. Now any app can `<PasskeyManager>` + call
  `loginWithPasskey` directly from `@groot/shell/store/auth`, keeping a single
  auth store. No change to existing fields or behavior.

- [#74](https://github.com/AshikNesin/groot/pull/74) [`225280b`](https://github.com/AshikNesin/groot/commit/225280b0899784e6fd92a363adb141dc7647bd24) Thanks [@AshikNesin](https://github.com/AshikNesin)! - Add `header` / `padded` / `mainClassName` / `className` slots to the shell `Layout`

  `<Layout/>` now accepts:

  - `header?: ReactNode` — render a custom header/nav (e.g. an app `<Navbar/>`)
    instead of the default shell header (logo + command palette + user menu).
  - `padded?: boolean` (default `true`) — toggle `<main>`'s default padding. Set
    `false` when pages own their own padding via `PageContainer`.
  - `mainClassName?` / `className?` — extra classes merged onto `<main>` / the
    outer wrapper.

  Fully backward compatible: `<Layout/>` with no props behaves exactly as before.
  Lets apps brand the shell without forking the whole layout component.

## 0.3.1

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

## 0.3.0

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
  - @groot/ui@0.2.0

## 0.2.0

### Minor Changes

- [#64](https://github.com/AshikNesin/groot/pull/64) [`ae54b49`](https://github.com/AshikNesin/groot/commit/ae54b4920f39b2dbd9432298855210cb4752cd57) Thanks [@AshikNesin](https://github.com/AshikNesin)! - refactor: reorganize codebase architecture

  - Flattened the `packages/` directory, merging `server`, `logger`, and `database` into `core`.
  - Renamed `client` to `shell`.
  - Moved boilerplate `auth`, `settings`, and `storage` modules out of `apps/web/src/client/pages` and into `@groot/shell`.
  - Replaced all legacy paths with their new equivalents in all codebase documentation, tests, and comments.

### Patch Changes

- Updated dependencies [[`ae54b49`](https://github.com/AshikNesin/groot/commit/ae54b4920f39b2dbd9432298855210cb4752cd57)]:
  - @groot/ui@0.1.0

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
