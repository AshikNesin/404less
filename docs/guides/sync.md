# Boilerplate Sync Guide

This guide covers the complete lifecycle of keeping child projects in sync with the groot boilerplate.

---

## Overview

The groot sync system has four workflows:

| Workflow     | Direction     | Command               | Purpose                                |
| ------------ | ------------- | --------------------- | -------------------------------------- |
| **Sync**     | groot → child | `pnpm groot:sync`     | Pull + 3-way merge boilerplate updates |
| **Resolve**  | local         | `pnpm groot:resolve`  | AI-resolve conflicts (pi coding agent) |
| **Upstream** | child → groot | `pnpm groot:upstream` | Push bug fixes back to the boilerplate |
| **Release**  | groot         | `pnpm changeset`      | Version and document changes in groot  |

---

## How Versioning Works

Groot uses [changesets](https://github.com/changesets/changesets) for versioning.
The released packages are the root `groot` package and the kit packages
`@groot/core`, `@groot/jobs`, `@groot/shell`, `@groot/ui` and `@groot/ai`
(all private: they are versioned, never published to npm).

1. **When making changes to groot**, add a changeset file:

   ```bash
   pnpm changeset
   ```

   This asks which packages changed, the change type (patch/minor/major) and a
   description.

2. **On push to `main`**, `.github/workflows/release.yml` opens or updates a
   "chore: version packages" PR that:
   - Bumps the version in each named package's `package.json` (dependents such
     as `@groot/web` get a patch bump)
   - Updates each package's `CHANGELOG.md` with its pending entries
   - Removes consumed changeset files

3. **When the version PR merges**, the workflow tags the root version (e.g.
   `v3.1.0`) and creates a GitHub Release from the root `CHANGELOG.md`.

The tag follows the root `groot` version only, and sync reads versions from
those tags and changelog entries from the root `CHANGELOG.md`. Name `"groot"`
in the changeset when a change should appear as a new boilerplate version to
child projects; a release that bumps only kit packages creates no new tag.

### Changeset Types

| Type    | When to use                          | Example                                   |
| ------- | ------------------------------------ | ----------------------------------------- |
| `patch` | Bug fixes, typo corrections          | `fix(core): handle null in error handler` |
| `minor` | New features, non-breaking additions | `feat(ui): add DatePicker component`      |
| `major` | Breaking changes requiring migration | `feat!: change the logger sink API`       |

### Which packages a changeset must name

`pnpm check:changesets` (run in CI against the base branch) fails a branch that
changes a managed surface without naming its package:

| Changed path                                                             | Package to name                   |
| ------------------------------------------------------------------------ | --------------------------------- |
| `packages/<pkg>/src/**`                                                  | that package (`@groot/core`, ...) |
| `packages/<pkg>/package.json` (any key but `name`, `version`, `private`) | that package                      |
| `apps/web/drizzle/**`, `.groot/**`                                       | `groot`                           |

Docs-only or internal changes to those paths can instead carry a reviewed
reason file under `.changeset/no-release/` (any non-empty `.md`; it covers the
whole branch). The release bot's own commits are exempt.

### Writing a Changeset (for AI Agents)

Create a markdown file in `.changeset/` with a descriptive name, naming every
package the branch changed:

```markdown
---
"@groot/core": patch
---

fix(core): `Boom.badRequest()` accepts a null message

The factory now falls back to the default message instead of throwing a
TypeError.
```

---

## Syncing (groot → child)

### Quick Start

```bash
# Check what's available (dry run)
pnpm groot:check

# Apply safe changes (auto-apply + clean 3-way merges) and write conflict markers
pnpm groot:sync

# Resolve any remaining conflicts with the pi coding agent
pnpm groot:resolve
```

### How It Works

1. Acquires the groot boilerplate checkout (see [Boilerplate checkout reuse](#boilerplate-checkout-reuse) below)
2. Reconciles the full set of synced files across three trees: ours (working
   tree), base (the `refs/groot/baseline` snapshot from the last sync, or the
   checkout at `last_sync.commit` when the snapshot is missing), and theirs
   (boilerplate HEAD). This makes sync idempotent and self-healing — lost
   state simply reconverges on the next run
3. Categorizes each file into one bucket:
   - **Auto-apply**: New upstream, or unmodified locally since last sync → copied
   - **Auto-merged**: Modified locally but a three-way merge (base = last sync, ours = local, theirs = groot) is clean → merged result written automatically
   - **Conflict**: Modified locally with overlapping changes → conflict markers written and recorded in `.groot/needs-review/manifest.json`
   - **Binary conflict**: A binary file changed on both sides → listed for manual reconciliation
   - **Deleted**: Removed upstream and unmodified locally → deleted locally; locally-modified files are kept and listed under **Deletion review** instead
   - **Kept local deletion**: Deleted in this repo (committed) but still upstream → left deleted
   - **Drift**: Changed in groot but matches no sync pattern (new boilerplate surface) → listed only
   - **Skipped**: Immutable (security) or app-specific paths → reported as counts only
4. Extracts the changelog between the last synced version and the latest `v*`
   tag from groot's root `CHANGELOG.md`, falling back to commit messages
5. Applies changes (refusing to overwrite files with uncommitted git changes
   unless `--force`), then advances the baseline ref and
   `boilerplate-sync.json` last, so a crash mid-apply never loses state
6. Writes a machine-readable `.groot/sync-report.json` (git-ignored, also
   written by `groot:check`) for CI consumption

Only **Conflict** and **Binary conflict** files need attention. Clean
three-way merges are applied automatically, so non-overlapping upstream changes
no longer pile up in a manual review list.

The root `package.json` is merged deterministically rather than line by line:
`scripts`, `dependencies` and `devDependencies` are merged per key (a key you
changed locally keeps your value), and every other top-level key stays local.
It only reaches the conflict manifest when that merge cannot run (invalid
JSON, or one of those sections is not an object).

> `pnpm groot:sync --skip-conflicts` applies only the clean changes and records
> conflicts in the manifest without writing markers into the working tree. CI
> uses this so the automated PR stays compilable.

### Resolving conflicts (`pnpm groot:resolve`)

Conflicts are resolved with the [pi coding agent](https://pi.dev) CLI in a
locked-down, single-shot run (`pi -p` with no session, no tools, no
extensions/skills/context files). Resolution runs on whatever provider/model
the developer has configured in pi — ZAI/GLM, Anthropic, Copilot, OpenRouter,
and more.

```bash
pnpm groot:resolve                     # resolve every file in the manifest
pnpm groot:resolve --dry-run           # list pending conflicts only
pnpm groot:resolve --file path.ts      # resolve a single file (repeatable)
pnpm groot:resolve --no-verify         # skip the post-resolution `pnpm check`
pnpm groot:resolve --model zai/glm-4.7 # pin a model (pattern or provider/id)
```

`resolve.ts` reads `.groot/needs-review/manifest.json` and checks for the pi
CLI once up front. Files that already contain conflict markers are resolved
directly. When sync ran with `--skip-conflicts`, it regenerates the markers
from the boilerplate checkout at the recorded target commit and the same base
sync uses (two-way markers when no base is available). It then runs pi per
file. The model merges both sides while preserving local customizations and
following `AGENTS.md` conventions; the tool validates the response (non-empty,
no conflict markers, retried once with feedback) before anything is written, so
a malformed model response never reaches disk. Resolved entries are pruned from
the manifest, and `pnpm check` runs at the end to verify.

**Prerequisites:** install and authenticate the pi CLI:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
export ZAI_API_KEY=...   # any pi-supported provider key, or `pi` + /login
```

To pin a provider/model instead of using pi's configured default, set
`GROOT_RESOLVE_PROVIDER` and `GROOT_RESOLVE_MODEL` (plain environment
variables read by `.groot/resolve.ts`; `--model` wins over
`GROOT_RESOLVE_MODEL`).

### Boilerplate checkout reuse

To avoid re-cloning the boilerplate on every run, `groot:sync`, `groot:resolve`
(when it has to regenerate markers) and the `groot:upstream` diff step reuse a
local checkout when it's safe to do so:

1. Look for a clone at `~/Code/<boilerplate.name>` (i.e. `~/Code/groot`).
2. Verify its `origin` matches the configured `boilerplate.repo` (HTTPS and SSH URLs are treated as equivalent).
3. Confirm the working tree is **clean** (`git status --porcelain` empty).
4. Check out the boilerplate's default branch and fast-forward it with
   `git pull --ff-only`. Both steps are best-effort: if either fails, the
   checkout is used in its current state.

If the clone is missing, is not a git repo, has a different origin or has
uncommitted changes, the tool falls back to a fresh shallow clone into a temp
directory, which is cleaned up afterwards. A reused local checkout is **never**
modified destructively or deleted.

> Tip: keep `~/Code/groot` on `main` with no uncommitted changes and sync runs will skip the clone entirely.

### What Gets Synced

`.groot/lib/patterns.ts` is the single source of truth, and both sync and
upstream classify with it. In summary:

- **Synced**: `packages/**`, `apps/*/package.json`, `apps/*/tsconfig.json`,
  root config (`*.config.*`, `tsconfig*.json`, `components.json`,
  `railpack.json`, `.gitleaks.toml`), `.github/workflows/**`, `.vite-hooks/**`,
  `scripts/**`, `.groot/**` (the tool's code), `.agents/skills/**`, `docs/**`,
  `.env.example`, and the tests that exercise synced source (declared in
  `TEST_AREA_OWNERSHIP`, plus `tests/server/setup.ts`).
- **Always three-way merged**: `package.json`, `.gitignore`,
  `pnpm-workspace.yaml`.
- **App-owned, never synced**: `apps/web/src/**`, `apps/web/drizzle/**`,
  `apps/web/index.html`, `tests/server/app/**`, `tests/e2e/**`, `README.md`,
  `pnpm-lock.yaml`, and anything in `additional_exclusions`.
- **Immutable, cannot be overridden**: `.env` files, `wrangler.jsonc`,
  `apps/web/drizzle/**`, keys and `secrets/**`, and the sync state
  (`.groot/boilerplate-sync.json`, `.groot/sync-report.json`,
  `.groot/needs-review/**`).

### Configuration

The sync state is tracked in `.groot/boilerplate-sync.json`:

```json
{
  "boilerplate": {
    "name": "groot",
    "repo": "https://github.com/AshikNesin/groot"
  },
  "last_sync": {
    "version": "3.0.0",
    "commit": "abc1234",
    "date": "2026-06-15T00:00:00Z"
  },
  "additional_exclusions": []
}
```

### Adding Project-Specific Exclusions

If your project has customized a synced component and you don't want it overwritten:

```json
{
  "additional_exclusions": ["packages/ui/src/button.tsx", "packages/core/src/logger/**"]
}
```

### CI/CD (Automated Sync)

The `.github/workflows/groot-sync.yml` workflow:

- Runs twice daily (12PM and 12AM IST) and on demand via `workflow_dispatch`
- Runs `pnpm groot:check`, then `pnpm groot:sync --skip-conflicts` when there
  is anything to apply, so the PR contains only clean changes
- Opens or updates a PR from `chore/groot-sync` whose description includes:
  - Version diff (e.g., v2.6.2 → v3.0.0)
  - Changelog entries
  - Breaking change warnings
  - Lists of auto-applied, auto-merged, deleted, deletion-review, conflict and drift files
- Conflicts are listed for local resolution via `pnpm groot:resolve`

---

## Upstream (child → groot)

When you fix a bug in a synced file within a child project, push it back to groot:

### Quick Start

```bash
# Interactive mode — select which files to upstream
pnpm groot:upstream

# Dry run — see what would be upstreamed
pnpm groot:upstream --dry-run

# Upstream every file that merges cleanly onto groot
pnpm groot:upstream --all
```

### Prerequisites

- [GitHub CLI (`gh`)](https://cli.github.com/) installed and authenticated
  (`brew install gh`, then `gh auth login`); `--dry-run` skips this check.
- Push access to the groot repo: the branch is pushed to it directly, not to a
  fork.

### How It Works

Upstream is sync with the sides swapped: groot is the side being written and
your change is the incoming one.

1. Finds every synced file you changed since the last sync, against the same
   base sync uses (the `refs/groot/baseline` snapshot, else groot at
   `last_sync.commit`)
2. Three-way merges each change onto groot HEAD, so anything groot changed
   since your last sync is kept rather than reverted
3. Shows the files that merge cleanly with diff stats against groot HEAD
   (e.g., `+5 -2`). Files where groot changed the same lines are listed as
   conflicts and left out — run `pnpm groot:sync`, resolve, then upstream
   again. Files groot has deleted since are listed and skipped
4. In interactive mode, lets you select which files to upstream
5. Clones groot fresh, re-merges the selected files onto that clone, and
   commits them on a branch `upstream/<package.json name>/<date>`
6. Pushes the branch and opens a PR on the groot repo via `gh pr create`

Only files classified as synced (see [What Gets Synced](#what-gets-synced))
can be upstreamed; app-owned code is never eligible.

---

## Troubleshooting

### "Invalid commit SHA" error during sync

`last_sync.commit` in `.groot/boilerplate-sync.json` is not a 7–40 character
hex SHA. Set it to the groot commit you last synced from.

### "Last sync commit … is not reachable" error

Neither the `refs/groot/baseline` snapshot nor the boilerplate checkout has
`last_sync.commit`. A temp clone is deepened automatically, but a reused
`~/Code/groot` checkout is never modified: run `git fetch --unshallow` (or a
full fetch) there, or correct `last_sync.commit`.

### Files reported as conflicts

A conflict means the file was modified locally **and** groot changed the same
lines, so the three-way merge could not resolve it automatically. Options:

1. **AI-resolve (recommended)**: `pnpm groot:resolve` — the pi coding agent
   merges both sides and removes the conflict markers.
2. **Resolve manually**: Open the file, reconcile the `<<<<<<<` / `|||||||` /
   `=======` / `>>>>>>>` markers by hand.
3. **Accept boilerplate version**: Discard local changes for the file, then
   delete the relevant entry from `.groot/needs-review/manifest.json`.
4. **Keep local version**: Add the file to `additional_exclusions` so future
   syncs leave it untouched.

### `pi` or `gh` CLI not found

`groot:resolve` needs the pi CLI (see the resolve
[prerequisites](#resolving-conflicts-pnpm-grootresolve)) and `groot:upstream`
needs an authenticated `gh` (see [Prerequisites](#prerequisites)).

### Upgrading a pre-2.0 project

Projects still on the flat `client/src` + `server/src` layout must move to the
workspace layout before syncing. The one-time `migrate-layout.ts` script that
does this was removed after v2.4.1; run it from that tag, in the project root:

```bash
git -C ~/Code/groot show v2.4.1:.groot/migrate-layout.ts > /tmp/migrate-layout.ts
pnpm exec tsx /tmp/migrate-layout.ts --check   # dry run; drop --check to apply
```

### Sync shows commit SHAs instead of versions

The sync tool resolves versions from groot's `v*` tags (e.g. `v3.0.0`). If no
tags are reachable, it reports commit SHAs and builds the changelog from commit
messages.
