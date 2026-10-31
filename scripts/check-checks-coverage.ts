#!/usr/bin/env tsx
/**
 * Checks-coverage guard for the declared test ownership in
 * `.groot/lib/patterns.ts` (TEST_AREA_OWNERSHIP).
 *
 * Catches the two ways that map silently stops guarding:
 *
 *  1. An owned source root stops existing (renamed or deleted), so the map
 *     claims ownership of source that is no longer there.
 *  2. A declared test area stops existing or holds no tests. A renamed test
 *     area silently unschedules every suite under it — those tests fall to
 *     drift in sync — and nothing turns red.
 *
 * Usage:  tsx scripts/check-checks-coverage.ts
 * Exit:   0 = covered, 1 = stale ownership entry.
 */
import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { ownedSourceRootsForTests, TEST_AREA_OWNERSHIP } from "../.groot/lib/patterns";

const ROOT = new URL("..", import.meta.url).pathname;

/** Expand a root pattern (may contain one `*` segment) to the dirs that exist. */
function expandRoot(root: string): string[] {
  if (!root.includes("*")) return existsSync(join(ROOT, root)) ? [root] : [];
  const parts = root.split("/");
  const starAt = parts.indexOf("*");
  const base = join(ROOT, ...parts.slice(0, starAt));
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((entry) => statSync(join(base, entry)).isDirectory())
    .map((entry) => [...parts.slice(0, starAt), entry, ...parts.slice(starAt + 1)].join("/"))
    .filter((dir) => existsSync(join(ROOT, dir)));
}

interface Failure {
  kind: "root-missing" | "area-missing" | "area-empty";
  detail: string;
}

const failures: Failure[] = [];

// --- 1. Owned source roots (what the synced test areas own) exist. --------
const ownedRoots = ownedSourceRootsForTests();
for (const root of ownedRoots) {
  const dir = root.replace(/\/\*\*$/, "");
  if (expandRoot(dir).length === 0) {
    failures.push({
      kind: "root-missing",
      detail: `Owned source root "${root}" (from .groot/lib/patterns.ts TEST_AREA_OWNERSHIP) matches no directory on disk. Update the ownership map.`,
    });
  }
}

// --- 2. Every declared ownership area exists on disk and holds at least one
// test. Counting a test file (not "any file") keeps an area from being kept
// alive by its setup files alone.
function countTestFiles(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += countTestFiles(join(dir, entry.name));
    } else if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) {
      count += 1;
    }
  }
  return count;
}

for (const area of Object.keys(TEST_AREA_OWNERSHIP)) {
  if (!existsSync(join(ROOT, area))) {
    failures.push({
      kind: "area-missing",
      detail: `Declared test area "${area}" does not exist on disk. Rename or remove it in .groot/lib/patterns.ts TEST_AREA_OWNERSHIP — until then every suite under it classifies as drift in sync.`,
    });
    continue;
  }
  const tests = countTestFiles(area);
  if (tests === 0) {
    failures.push({
      kind: "area-empty",
      detail: `Declared test area "${area}" holds no test files. An area with no tests cannot own synced source; remove it from TEST_AREA_OWNERSHIP or add its suite.`,
    });
  }
}

// --- Report. --------------------------------------------------------------
if (failures.length > 0) {
  console.error(
    `❌ Checks-coverage failed (${failures.length} gap${failures.length === 1 ? "" : "s"}):\n`,
  );
  for (const f of failures) {
    console.error(`  [${f.kind}] ${f.detail}`);
  }
  process.exit(1);
}

console.log(
  `✓ Checks covered: ${Object.keys(TEST_AREA_OWNERSHIP).length} declared test areas ` +
    `owning ${ownedRoots.length} source roots, all present on disk.`,
);
process.exit(0);
