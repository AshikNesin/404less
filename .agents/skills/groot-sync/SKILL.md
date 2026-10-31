---
name: groot-sync
description: Sync reusable core components and infrastructure from the groot boilerplate repo. Includes UI components, server core utilities, middlewares, shared hooks, docs, and infrastructure. Also supports upstreaming child-repo fixes back to groot. Triggers on "groot sync", "sync from groot", "pull boilerplate changes", "update from boilerplate", "upstream to groot", "push fix to groot", "changeset", "add changeset".
metadata:
  tags: sync, boilerplate, groot, infrastructure, components, utilities, upstream, versioning, changelog
---

## Groot Sync v5

This skill references the TypeScript sync tools at `.groot/sync.ts`,
`.groot/resolve.ts`, and `.groot/upstream.ts`.

Full documentation: [docs/guides/sync.md](../../../docs/guides/sync.md)

## Quick Start

```bash
# Check for available changes (dry run)
pnpm groot:check

# Apply safe changes (auto-apply + clean 3-way merges) and write conflict markers
pnpm groot:sync

# Resolve any remaining conflicts with the pi coding agent
pnpm groot:resolve

# Push local fixes back to groot
pnpm groot:upstream

# Add a changeset (for groot repo changes)
pnpm changeset
```

## How It Works

### Sync (groot → child)

The sync tool uses full-tree snapshot reconciliation (v5) and only escalates
true conflicts:

1. **Reads config** from `.groot/boilerplate-sync.json`
2. **Acquires boilerplate** — reuses a clean `~/Code/groot` checkout (fast-forwarded to its default branch) when available, otherwise clones to a temp directory (with tags for version resolution)
3. **Builds a baseline snapshot** — a parentless git commit of every synced file at the last-sync state, stored as `refs/groot/baseline`. Rebuilt from the checkout when missing, making sync self-healing
4. **Reconciles the full file tree** across three trees: ours (working tree), base (baseline snapshot), theirs (boilerplate HEAD). Categorizes each file using pattern matching (micromatch)
5. **Three-way merges** every locally-modified synced file (base = baseline, ours = local, theirs = groot)
6. **Extracts changelog** between synced version and latest version
7. **Applies** auto-apply (unmodified), clean 3-way merges, and safe deletions (removed upstream + unmodified locally), refusing to overwrite files with uncommitted git changes unless `--force`
8. **Advances state** — updates the baseline ref and `boilerplate-sync.json` last, so a crash mid-apply never loses state
9. **Writes conflict markers** for files that genuinely conflict and records them in `.groot/needs-review/manifest.json`
10. **Writes sync report** (`sync-report.json`) for CI consumption

### Resolve conflicts (AI-assisted)

After sync, resolve the residual conflicts with the [pi coding agent](https://pi.dev) CLI:

```bash
pnpm groot:resolve            # resolve every file in the manifest
pnpm groot:resolve --dry-run  # list pending conflicts only
pnpm groot:resolve --file path/to/file.ts   # resolve one file
```

`resolve.ts` reads `.groot/needs-review/manifest.json`, ensures each file has
conflict markers (regenerating them from the local baseline snapshot and the
recorded target commit when CI ran with `--skip-conflicts`), then runs pi per
file in a locked-down single-shot mode (`pi -p` with no session, no tools, no
extensions/skills/context files). The model merges both sides while preserving
local customizations. The tool validates the response (non-empty, no conflict
markers, retried once with feedback) before writing anything, so a malformed
model response never reaches disk. It follows `AGENTS.md` conventions (fed in
as the system prompt). Resolved entries are pruned from the manifest and
`pnpm check` runs at the end to verify.

**The root `package.json` merges deterministically during sync, never through
`git merge-file`.** It is the most conflict-prone file and the one where a
malformed result (trailing comma, duplicate key) breaks the whole toolchain.
The reconcile step (`.groot/lib/reconcile.ts`) merges only `scripts` /
`dependencies` / `devDependencies` (3-way: unmodified-locally → adopt
upstream; modified-locally → local wins) and copies every other top-level key
verbatim from the local file; the pure merge logic lives in
`.groot/lib/package-json-merge.ts`. It only reaches the manifest when that
merge cannot run (a side isn't valid JSON, or a managed section isn't an
object), and `groot:resolve` then treats it like any other file.

> Requires the pi CLI (`npm install -g --ignore-scripts @earendil-works/pi-coding-agent`)
> and authentication (any pi-supported provider key, e.g. `export ZAI_API_KEY=...`,
> or `pi` + /login).

When you are operating inside an agent session (e.g. Droid) you may instead
resolve the manifest's files directly with your own editing tools — the
manifest gives you each file, its conflict count, and the upstream commit
messages explaining the change.

### Upstream (child → groot)

Push child-repo bug fixes back to the boilerplate. Upstream is sync with the
sides swapped (`planUpstream` in `.groot/lib/engine.ts`):

1. **Finds changed synced files** — every synced file modified locally since the last sync, against the same base sync uses (baseline snapshot, else groot at `last_sync.commit`)
2. **Three-way merges onto groot HEAD** — groot's changes since the last sync are kept; overlapping edits are listed as conflicts and left out (sync first, then upstream); files groot deleted are skipped
3. **Shows the clean candidates** with diff stats against groot HEAD
4. **Interactive selection** of which files to upstream (`--all` takes every clean one)
5. **Creates PR on groot** via GitHub CLI (`gh`), re-merging onto a fresh clone first

### Versioning (changesets)

Groot uses [changesets](https://github.com/changesets/changesets) for automated versioning:

1. **Add changeset**: `pnpm changeset` or create a file in `.changeset/`
2. **On merge to main**: GitHub Action creates a "Version Packages" PR
3. **On version PR merge**: Git tag + GitHub Release created automatically

## Sync Rules (Encoded in .groot/lib/patterns.ts)

### Always Sync (Reusable Core)

| Category           | Paths                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace Packages | `packages/**` (ui, shell, core, jobs, ai — the whole kit ships to children)                                                                                           |
| App Config Files   | `apps/*/package.json`, `apps/*/tsconfig.json`                                                                                                                         |
| Tests (mirrors)    | Ownership-declared, see the table below — a test syncs when the source it exercises syncs                                                                             |
| Test Setup         | `tests/server/setup.ts`                                                                                                                                               |
| Infrastructure     | `*.config.*`, `tsconfig.json`, `tsconfig.base.json`, `.github/workflows/**`, `.vite-hooks/**`, `.gitleaks.toml`, `scripts/**`, `postcss.config.js`, `components.json` |
| Sync Tooling       | `.groot/**` (code only — state files are immutable, see below)                                                                                                        |
| Agent Skills       | `.agents/skills/**`                                                                                                                                                   |
| Documentation      | `docs/**`                                                                                                                                                             |
| Deployment Config  | `railpack.json`                                                                                                                                                       |
| Env Template       | `.env.example`                                                                                                                                                        |

`.gitignore`, `package.json` and `pnpm-workspace.yaml` match no glob but always
go through the three-way merge (`FORCE_MERGE_FILES`).

### Test Ownership (TEST_AREA_OWNERSHIP in .groot/lib/patterns.ts)

Tests are not listed by directory-name patterns. Each declared area owns the
synced source it exercises, and a test under `tests/` syncs when its deepest
declaring area contains it (longest prefix wins). Ownership is a declared
maintenance fact, not inferred from imports.

| Test area                      | Owns (synced source)                                  |
| ------------------------------ | ----------------------------------------------------- |
| `tests/server/ai`              | `packages/ai/src/**`                                  |
| `tests/server/core`            | `packages/core/src/**`                                |
| `tests/server/jobs`            | `packages/jobs/src/server/**`                         |
| `tests/server/api`             | `packages/core/src/**`, `packages/jobs/src/server/**` |
| `tests/server/groot`           | `.groot/**`                                           |
| `tests/client/components/ui`   | `packages/ui/src/**`                                  |
| `tests/client/components/jobs` | `packages/jobs/src/client/**`                         |
| `tests/client`                 | `packages/shell/src/**`                               |

Adding a suite for synced source means adding (or extending) its area in
`TEST_AREA_OWNERSHIP`; an undeclared `tests/` path classifies as drift, which
is the signal to declare it. `pnpm check:coverage` fails when a declared area
is missing on disk or holds no test files.

### Never Sync (App-Specific)

| Category            | Paths                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------- |
| App Source          | `apps/web/src/**` (routes, entries, `config.ts`, `db/schema.ts` — both sides)               |
| App Migrations      | `apps/web/drizzle/**` (generated by drizzle-kit from the app schema; also immutable, below) |
| App Entry           | `apps/web/index.html` (downstream branding)                                                 |
| Project-Local Tests | `tests/server/app/**`, `tests/e2e/**`                                                       |
| Project Docs        | `README.md`                                                                                 |
| Lockfile            | `pnpm-lock.yaml`                                                                            |

### Immutable Exclusions (Security - Cannot Override)

These files are NEVER synced, even if removed from config:

- `.env`, `.env.local`, `.env.development`, `.env.production`, `.env.*.local`
- `apps/web/drizzle/**`, `wrangler.jsonc` (per-project database id, bucket name, domain)
- `node_modules/**`, `dist/**`, `.git/**`
- `*.pem`, `*.key`, `secrets/**`
- `.groot/boilerplate-sync.json`, `.groot/sync-report.json`, `.groot/needs-review/**`, `.groot/feature-request.md`, `.groot/repo-drift.md`

## Categorization (per changed file)

Each file changed in groot since the last sync lands in exactly one bucket:

| Bucket          | Meaning                                                    | Action                                  |
| --------------- | ---------------------------------------------------------- | --------------------------------------- |
| **Auto-apply**  | New locally, or unmodified locally since last sync         | Copied automatically                    |
| **Auto-merged** | Modified locally but the 3-way merge is clean (no overlap) | Merged result written automatically     |
| **Conflict**    | Modified locally with overlapping changes                  | Markers written + recorded in manifest  |
| **Drift**       | Changed in groot but matches no sync pattern (new surface) | Listed only — adopt manually if desired |
| **Skipped**     | Immutable (security) or app-specific paths                 | Ignored (counts only in output)         |

Only **Conflict** files need attention, and `pnpm groot:resolve` handles those
with the pi coding agent. Clean 3-way merges no longer require manual review.

## Config Format

```json
{
  "boilerplate": {
    "name": "groot",
    "repo": "https://github.com/AshikNesin/groot"
  },
  "last_sync": {
    "version": "1.3.0",
    "commit": "abc1234",
    "date": "2026-03-15T20:00:00Z"
  },
  "additional_exclusions": []
}
```

## CI/CD Integration

### Sync Workflow (`.github/workflows/groot-sync.yml`)

- Runs twice daily (12PM and 12AM IST)
- Uses the TypeScript tool (no external AI service)
- Runs `pnpm groot:sync --skip-conflicts` so the automated PR contains only
  clean changes (auto-apply + clean 3-way merges) and stays compilable
- Creates PR with rich description from `sync-report.json`:
  - Version diff (e.g., v1.3.0 → v1.5.0)
  - Changelog entries between versions
  - Breaking change warnings
  - Auto-applied, auto-merged, conflict, and drift file lists
- Conflicts are listed for the developer to resolve locally with
  `pnpm groot:resolve` (AI resolution does not run in CI)

### Release Workflow (`.github/workflows/release.yml`)

- Triggers on push to `main`
- If changeset files exist → creates "Version Packages" PR
- When version PR merges → creates git tag and GitHub Release

## Writing Changesets (for AI Agents)

When modifying groot's syncable code, create a changeset file:

```bash
# File: .changeset/<random-name>.md
---
"groot": patch
---

fix(core): handle null values in Boom error handler
```

Use `patch` for fixes, `minor` for new features, `major` for breaking changes.

## Manual Override

To add project-specific exclusions, add patterns to `additional_exclusions` in the config:

```json
{
  "additional_exclusions": ["packages/ui/src/button.tsx", "packages/core/src/logger/**"]
}
```

Note: Immutable exclusions cannot be overridden.
