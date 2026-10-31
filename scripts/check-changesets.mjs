#!/usr/bin/env node
// Changeset completeness gate.
//
// Groot ships a published kit (packages, apps/web/drizzle, .groot) to child
// repositories. A branch that edits a managed surface without recording a
// changeset produces unversioned drift for every consumer, and the only
// remedy is a later backfill commit. This gate makes that a build failure
// instead of a convention.
//
// Rules:
//   1. A branch that changes files under packages/[pkg]/src, apps/web/drizzle,
//      or .groot needs a changeset naming each affected package, or a
//      reviewed no-release reason file under .changeset/no-release/.
//   2. apps/web/drizzle and .groot belong to the root "groot" package, so a
//      changeset naming "groot" covers them.
//   3. The release bot's own commits are exempt, because versioning PRs are
//      the output of this gate, not its input.
//
// A no-release reason file records why a change ships without a version bump
// (docs-only, internal refactor, test-only). It covers the whole branch, not
// one package: the review that accepted the reason is the record.
//
// Usage: pnpm check:changesets [--base <ref>] [--root <dir>]
// The base defaults to the merge-base with origin/main.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

const ROOT_PACKAGE = "groot";
const RELEASE_BOTS = ["github-actions[bot]", "renovate[bot]"];
const BOT_EMAIL_SUFFIX = "@users.noreply.github.com";

// Path prefixes whose changes must be covered by a changeset. A kit
// package's package.json carries its exports map, entrypoints, and published
// file list, which is the surface a child repo consumes first, so a
// manifest edit needs coverage even when no source file changed.
const MANAGED_PREFIXES = [
  "packages/*/src",
  "packages/*/package.json",
  "apps/web/drizzle",
  ".groot",
];

export function matchesManagedPrefix(file) {
  return MANAGED_PREFIXES.some((prefix) => {
    const pattern = "^" + prefix.split("*").map(escapeRegex).join("[^/]+") + "(/|$)";
    return new RegExp(pattern).test(file);
  });
}

// True when the package.json changed between two blobs in a way a consumer
// can observe: a different value under any top-level key except name,
// version, and private. Version is excepted because the release bot owns it
// and its commits are already exempt by author, so a bot bump never reaches
// this test. Every other key counts — exports, main, types, files,
// dependencies, peerDependencies, or a field invented later — so a new
// publishing-relevant key cannot slip through an allowlist. An allowlist
// would also invert the gate's meaning: unlisted would mean safe.
export function pkgJsonChangeIsReleaseRelevant(beforeJson, afterJson) {
  let before;
  let after;
  try {
    before = JSON.parse(beforeJson);
    after = JSON.parse(afterJson);
  } catch {
    // An unparseable manifest is a broken publish surface; surface it here
    // rather than at release time.
    return true;
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (key === "name" || key === "version" || key === "private") continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) return true;
  }
  return false;
}

// True for packages/[pkg]/package.json, the kit's published manifest.
function isKitPackageJson(file) {
  return /^packages\/[^/]+\/package\.json$/.test(file);
}

// The package.json content at HEAD, used when an entry carries no blobs.
function readPkgJsonAt(rootDir, file) {
  const absolute = path.join(rootDir, file);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
}

// Map a packages/[pkg]/src path to its npm package name from package.json.
// Files under apps/web/drizzle or .groot map to the root package.
function packageNameFor(file, rootDir) {
  if (file.startsWith("apps/web/drizzle") || file.startsWith(".groot/")) {
    return ROOT_PACKAGE;
  }
  const scopeDir = file.split("/")[1];
  if (!scopeDir) return null;
  const pkgJson = path.join(rootDir, "packages", scopeDir, "package.json");
  if (!existsSync(pkgJson)) return null;
  return JSON.parse(readFileSync(pkgJson, "utf8")).name ?? null;
}

// Package names released by one changeset file's frontmatter. Quotes are the
// changesets CLI's own output format; unquoted names are accepted too. A
// release line must name a bump kind, so prose that merely looks like YAML
// (the changesets README) does not register as coverage.
export function parseChangesetReleases(body) {
  const match = /^---\n([\s\S]*?)\n---/.exec(body);
  if (!match) return [];
  const names = [];
  for (const line of match[1].split("\n")) {
    const trimmed = line.trim();
    const quoted =
      /^'([^']+)':\s*(?:major|minor|patch)\s*$/.exec(trimmed) ??
      /^"([^"]+)":\s*(?:major|minor|patch)\s*$/.exec(trimmed);
    if (quoted) {
      names.push(quoted[1]);
      continue;
    }
    const bare = /^([@A-Za-z][^:\s]*):\s*(?:major|minor|patch)\s*$/.exec(trimmed);
    if (bare) names.push(bare[1]);
  }
  return names;
}

// True when a commit author is the release bot.
export function isReleaseBotCommit(commit) {
  const { name, email } = commit;
  if (RELEASE_BOTS.includes(name)) return true;
  return (
    (name === "github-actions" || name === "renovate") &&
    typeof email === "string" &&
    email.endsWith(BOT_EMAIL_SUFFIX)
  );
}

// The checkable state of one branch, pure over its inputs so the unit test
// can drive fixture diffs without spawning git for the package mapping.
// changedEntries pairs each changed path with its package.json pre-image
// and post-image so manifest edits are filtered by field; changedFiles
// alone treats every packages/[pkg]/package.json edit as release-relevant.
export function collect(state) {
  const rootDir = state.rootDir ?? process.cwd();
  const entries = state.changedEntries ?? state.changedFiles.map((f) => ({ file: f }));
  const changedManagedFiles = [];
  const managedPackages = new Set();
  for (const entry of entries) {
    if (!matchesManagedPrefix(entry.file)) continue;
    if (
      isKitPackageJson(entry.file) &&
      !pkgJsonChangeIsReleaseRelevant(
        entry.pkgJsonBefore ?? "",
        entry.pkgJsonAfter ?? readPkgJsonAt(rootDir, entry.file),
      )
    ) {
      continue;
    }
    changedManagedFiles.push(entry.file);
    const name = packageNameFor(entry.file, rootDir);
    if (name) managedPackages.add(name);
  }
  const coveredPackages = new Set();
  for (const entry of state.changesetFiles) {
    for (const name of parseChangesetReleases(entry.body)) {
      coveredPackages.add(name);
    }
  }
  return {
    managedPackages: [...managedPackages].sort(),
    coveredPackages: [...coveredPackages].sort(),
    reason: state.noReleaseReason ?? null,
    changedManagedFiles: changedManagedFiles.sort(),
  };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function git(args, root) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function listChangesetFiles(root) {
  const dir = path.join(root, ".changeset");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((name) => ({ name, body: readFileSync(path.join(dir, name), "utf8") }));
}

// The earliest no-release reason file, or null. Any recorded, non-empty
// reason satisfies the gate for the branch that carries it.
function findNoReleaseReason(root) {
  const dir = path.join(root, ".changeset", "no-release");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
  if (files.length === 0) return null;
  const body = readFileSync(path.join(dir, files[0]), "utf8").trim();
  if (!body) return null;
  return `${files[0]}: ${body.split("\n")[0]}`;
}

// True when every commit in base..HEAD that touches a managed file is the
// release bot's own. One human commit touching the surface voids the skip.
function botOnlySurfaces(root, base, managedFiles) {
  const managed = new Set(managedFiles);
  const commits = git(["rev-list", `${base}..HEAD`], root)
    .split("\n")
    .filter(Boolean);
  return commits.every((sha) => {
    const touched = git(["diff-tree", "--no-commit-id", "--name-only", "-r", sha], root)
      .split("\n")
      .filter(Boolean);
    if (!touched.some((f) => managed.has(f))) return true;
    const [name, email] = git(["show", "-s", "--format=%an%n%ae", sha], root).split("\n");
    return isReleaseBotCommit({ name, email });
  });
}

// The verdict for one branch state, pure over collect()'s output. The
// release-bot exemption is layered on by run(), because it needs git.
export function evaluate(state) {
  if (state.managedPackages.length === 0) {
    return {
      status: 0,
      out: "changesets: no managed package surface changed; nothing to cover\n",
    };
  }
  if (state.reason) {
    return {
      status: 0,
      out:
        `changesets: no-release reason accepted (${state.reason})\n` +
        `  changed managed surface: ${state.managedPackages.join(", ")}\n`,
    };
  }
  const missing = state.managedPackages.filter((p) => !state.coveredPackages.includes(p));
  if (missing.length === 0) {
    return {
      status: 0,
      out: `changesets: ${state.managedPackages.join(", ")} covered\n`,
    };
  }
  return {
    status: 1,
    missing,
    err:
      `changesets: missing changeset for ${missing.join(", ")}\n` +
      `  changed managed files:\n` +
      state.changedManagedFiles.map((f) => `    ${f}\n`).join("") +
      `  run pnpm changeset, or record the reviewed reason under .changeset/no-release/ for a docs-only or internal change\n`,
  };
}

// The file content at one revision, or "" when it does not exist there.
// Reading the real blobs from git is exact where reconstructing them from a
// diff is not: a diff carries only the lines around each hunk, so a partial
// reconstruction of a JSON manifest cannot be parsed.
function showBlob(root, revision, file) {
  try {
    return git(["show", `${revision}:${file}`], root);
  } catch {
    return "";
  }
}

export function run({ base, root }) {
  const repoRoot = root ?? process.cwd();
  const diffBase = base ?? git(["merge-base", "origin/main", "HEAD"], repoRoot);
  const changedFiles = git(["diff", "--name-only", `${diffBase}...HEAD`], repoRoot)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const changedEntries = changedFiles.map((file) => {
    if (!isKitPackageJson(file)) return { file };
    return {
      file,
      pkgJsonBefore: showBlob(repoRoot, diffBase, file),
      pkgJsonAfter: showBlob(repoRoot, "HEAD", file),
    };
  });
  const state = collect({
    rootDir: repoRoot,
    changedFiles,
    changedEntries,
    changesetFiles: listChangesetFiles(repoRoot),
    noReleaseReason: findNoReleaseReason(repoRoot),
  });
  const verdict = evaluate(state);
  if (verdict.status === 1 && botOnlySurfaces(repoRoot, diffBase, state.changedManagedFiles)) {
    return {
      status: 0,
      out:
        `changesets: skipping release-bot commits (exempt authors: ${RELEASE_BOTS.join(", ")})\n` +
        `  changed managed surface: ${state.managedPackages.join(", ")}\n`,
      state,
      base: diffBase,
    };
  }
  return { ...verdict, state, base: diffBase };
}

function flagValue(args, flag) {
  const i = args.indexOf(flag);
  return i === -1 ? null : args[i + 1];
}

function invokedAsCli() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (invokedAsCli()) {
  const result = run({
    base: flagValue(process.argv.slice(2), "--base"),
    root: flagValue(process.argv.slice(2), "--root"),
  });
  if (result.out) process.stdout.write(result.out);
  if (result.err) process.stderr.write(result.err);
  process.exitCode = result.status;
}
