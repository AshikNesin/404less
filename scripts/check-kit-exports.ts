#!/usr/bin/env tsx
/**
 * Kit export guard.
 *
 * @groot/ui, @groot/jobs and @groot/ai declare every public entrypoint explicitly. A
 * wildcard export ("./*") accepts any file that lands in src, so the public
 * surface would drift silently. This guard keeps three sets in agreement:
 * the explicit keys in each package's exports map, the source files under
 * src, and the subpaths the compiled consumer fixture
 * (tests/kit-consumers/consumer.tsx) imports.
 *
 * - A source file no entry targets is a module outside the public map, or an
 *   entry someone forgot to add. Both are drift.
 * - An entry whose target file does not exist is a broken subpath.
 * - A subpath the fixture never imports is unexercised. The fixture is the
 *   gate for the removal policy in AGENTS.md, so an unexercised subpath
 *   fails rather than shipping untested surface.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_EXTENSION = /\.(ts|tsx)$/;

interface PackageRule {
  name: string;
  manifest: string;
  /** Entry key for a fixture import specifier, or null when out of scope. */
  keyForSpecifier: (specifier: string) => string | null;
}

const PACKAGES: PackageRule[] = [
  {
    name: "@groot/ui",
    manifest: "packages/ui/package.json",
    keyForSpecifier: (specifier) =>
      specifier === "@groot/ui"
        ? "."
        : specifier.startsWith("@groot/ui/")
          ? `.${specifier.slice("@groot/ui".length)}`
          : null,
  },
  {
    name: "@groot/jobs",
    manifest: "packages/jobs/package.json",
    keyForSpecifier: (specifier) =>
      specifier.startsWith("@groot/jobs/") ? `.${specifier.slice("@groot/jobs".length)}` : null,
  },
  {
    name: "@groot/ai",
    manifest: "packages/ai/package.json",
    keyForSpecifier: (specifier) =>
      specifier === "@groot/ai"
        ? "."
        : specifier.startsWith("@groot/ai/")
          ? `.${specifier.slice("@groot/ai".length)}`
          : null,
  },
];

function stripExtension(file: string): string {
  return file.replace(/\.tsx?$/, "");
}

function listSourceFiles(srcDir: string): Set<string> {
  const files = new Set<string>();
  const queue = [srcDir];
  while (queue.length > 0) {
    const dir = queue.shift()!;
    for (const entry of fs.readdirSync(path.join(repoRoot, dir), { withFileTypes: true })) {
      const relative = `${dir}/${entry.name}`;
      if (entry.isDirectory()) queue.push(relative);
      else if (SOURCE_EXTENSION.test(entry.name)) files.add(stripExtension(relative));
    }
  }
  return files;
}

function readManifest(rule: PackageRule): { targets: Map<string, string>; wildcards: string[] } {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, rule.manifest), "utf8"));
  const targets = new Map<string, string>();
  const wildcards: string[] = [];
  for (const [key, value] of Object.entries(pkg.exports ?? {})) {
    if (key.includes("*")) {
      wildcards.push(key);
      continue;
    }
    const target = path.normalize(path.join(path.dirname(rule.manifest), String(value)));
    targets.set(key, stripExtension(target.split(path.sep).join("/")));
  }
  return { targets, wildcards };
}

function fixtureImports(): Set<string> {
  const source = fs.readFileSync(path.join(repoRoot, "tests/kit-consumers/consumer.tsx"), "utf8");
  const imports = new Set<string>();
  for (const match of source.matchAll(/from "(@groot\/[a-z]+(?:\/[^"]*)?)"/g))
    imports.add(match[1]);
  if (imports.size === 0) {
    throw new Error("tests/kit-consumers/consumer.tsx matched no @groot/* imports");
  }
  return imports;
}

let failed = false;
const exercised = fixtureImports();

for (const rule of PACKAGES) {
  const { targets, wildcards } = readManifest(rule);
  for (const key of wildcards) {
    console.error(`${rule.manifest}: wildcard export "${key}" — list entrypoints explicitly`);
    failed = true;
  }

  const srcDir = path.join(path.dirname(rule.manifest), "src");
  const sources = listSourceFiles(srcDir);
  const targeted = new Set(targets.values());

  const unowned = [...sources].filter((source) => !targeted.has(source)).sort();
  for (const file of unowned) {
    console.error(
      `${rule.name}: source ${path.relative(repoRoot, file)} is targeted by no exports entry`,
    );
    failed = true;
  }
  for (const [key, target] of [...targets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!sources.has(target)) {
      console.error(
        `${rule.name}: exports entry "${key}" targets missing file ${path.relative(repoRoot, target)}`,
      );
      failed = true;
    }
  }

  const exercisedKeys = new Set<string>();
  for (const specifier of exercised) {
    const key = rule.keyForSpecifier(specifier);
    if (key === null) continue;
    exercisedKeys.add(key);
    if (!targets.has(key)) {
      console.error(
        `${rule.name}: fixture imports "${specifier}" but the exports map has no such entry`,
      );
      failed = true;
    }
  }
  for (const key of [...targets.keys()].filter((k) => !exercisedKeys.has(k)).sort()) {
    console.error(`${rule.name}: subpath "${key}" is public but the kit fixture never imports it`);
    failed = true;
  }

  console.log(
    `${rule.name}: ${targets.size} entrypoints, ${exercisedKeys.size} exercised by the fixture`,
  );
}

if (failed) process.exit(1);
console.log("kit exports and consumer fixture agree");
