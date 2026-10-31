import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vite-plus/test";

/**
 * Changeset completeness gate (scripts/check-changesets.mjs).
 *
 * The gate turns release completeness from a convention into a check: a
 * branch that edits a managed surface (packages, apps/web/drizzle, .groot)
 * without a changeset or a recorded no-release reason fails the build. The
 * pure core runs here against fixture package trees, one with a changeset
 * and one without, asserting the pass and fail verdicts the CLI reports.
 */

const repoRoot = process.cwd();
const SCRIPT = path.join("scripts", "check-changesets.mjs");

type Gate = {
  collect: (state: {
    rootDir?: string;
    changedFiles: string[];
    changesetFiles: { name: string; body: string }[];
    noReleaseReason?: string | null;
  }) => {
    managedPackages: string[];
    coveredPackages: string[];
    reason: string | null;
    changedManagedFiles: string[];
  };
  parseChangesetReleases: (body: string) => string[];
  isReleaseBotCommit: (commit: { name: string; email: string }) => boolean;
  evaluate: (state: {
    managedPackages: string[];
    coveredPackages: string[];
    reason: string | null;
    changedManagedFiles: string[];
  }) => { status: number; out?: string; err?: string; missing?: string[] };
  pkgJsonChangeIsReleaseRelevant: (beforeJson: string, afterJson: string) => boolean;
};

async function loadGate(): Promise<Gate> {
  return (await import(pathToFileUrlStr())) as unknown as Gate;
}

function pathToFileUrlStr(): string {
  return "file://" + path.resolve(repoRoot, SCRIPT);
}

function fixtureTree(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "af15-changesets-"));
  for (const [rel, body] of Object.entries(files)) {
    const target = path.join(dir, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, body);
  }
  return dir;
}

async function collectFixture(
  files: Record<string, string>,
  changedFiles: string[],
  changesetBodies: string[],
  noReleaseReason: string | null = null,
) {
  const dir = fixtureTree(files);
  try {
    const gate = await loadGate();
    return {
      state: gate.collect({
        rootDir: dir,
        changedFiles,
        changesetFiles: changesetBodies.map((body, i) => ({ name: `cs-${i}.md`, body })),
        noReleaseReason,
      }),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runGate(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("node", [SCRIPT, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 120_000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

const CORE_PKG = JSON.stringify({ name: "@groot/core" });
const UI_PKG = JSON.stringify({ name: "@groot/ui" });

describe("changesets gate", () => {
  it("maps changed managed files to their packages", async () => {
    const { state } = await collectFixture(
      { "packages/core/package.json": CORE_PKG, "packages/ui/package.json": UI_PKG },
      [
        "packages/core/src/logger/index.ts",
        "packages/ui/src/button.tsx",
        "docs/guide.md",
        "apps/web/src/pages/Home.tsx",
      ],
      [],
    );
    expect(state.managedPackages).toEqual(["@groot/core", "@groot/ui"]);
    expect(state.changedManagedFiles).toEqual([
      "packages/core/src/logger/index.ts",
      "packages/ui/src/button.tsx",
    ]);
  }, 20_000);

  it("maps migration and .groot changes to the root package", async () => {
    const { state } = await collectFixture(
      { "package.json": JSON.stringify({ name: "groot" }) },
      ["apps/web/drizzle/0000_init.sql", ".groot/lib/patterns.ts"],
      [],
    );
    expect(state.managedPackages).toEqual(["groot"]);
  }, 20_000);

  it("passes when every changed package has its changeset", async () => {
    const gate = await loadGate();
    const { state } = await collectFixture(
      { "packages/core/package.json": CORE_PKG },
      ["packages/core/src/logger/index.ts"],
      ['---\n"@groot/core": patch\n---\n\nTune the logger.\n'],
    );
    expect(state.managedPackages).toEqual(["@groot/core"]);
    expect(state.coveredPackages).toEqual(["@groot/core"]);
    const verdict = gate.evaluate(state);
    expect(verdict.status).toBe(0);
    expect(verdict.out).toContain("@groot/core covered");
  }, 20_000);

  it("fails and names the package whose changeset is missing", async () => {
    const gate = await loadGate();
    const { state } = await collectFixture(
      { "packages/core/package.json": CORE_PKG, "packages/ui/package.json": UI_PKG },
      ["packages/core/src/logger/index.ts", "packages/ui/src/button.tsx"],
      ['---\n"@groot/core": patch\n---\n\nTune the logger.\n'],
    );
    expect(state.managedPackages).toEqual(["@groot/core", "@groot/ui"]);
    expect(state.coveredPackages).toEqual(["@groot/core"]);
    const verdict = gate.evaluate(state);
    expect(verdict.status).toBe(1);
    expect(verdict.missing).toEqual(["@groot/ui"]);
    expect(verdict.err).toContain("missing changeset for @groot/ui");
  }, 20_000);

  it("accepts a recorded no-release reason", async () => {
    const gate = await loadGate();
    const { state } = await collectFixture(
      { "packages/core/package.json": CORE_PKG },
      ["packages/core/src/logger/index.ts"],
      [],
      "internal-only.md: refactor, no public surface change",
    );
    expect(state.reason).toContain("internal-only.md");
    const verdict = gate.evaluate(state);
    expect(verdict.status).toBe(0);
    expect(verdict.out).toContain("no-release reason accepted");
  }, 20_000);

  it("parses frontmatter and detects the release bot", async () => {
    const gate = await loadGate();
    expect(gate.parseChangesetReleases('---\n"@groot/core": patch\n---\n')).toEqual([
      "@groot/core",
    ]);
    expect(gate.parseChangesetReleases("---\n'@groot/core': patch\n---\n")).toEqual([
      "@groot/core",
    ]);
    expect(gate.parseChangesetReleases('---\n"groot": patch\n"@groot/core": major\n---\n')).toEqual(
      ["groot", "@groot/core"],
    );
    // Prose that mimics frontmatter must not count as coverage.
    expect(gate.parseChangesetReleases("# Changesets\n\nHello and welcome!")).toEqual([]);
    expect(gate.parseChangesetReleases('---\n"groot": patch (draft)\n---\n')).toEqual([]);
    expect(
      gate.isReleaseBotCommit({
        name: "github-actions[bot]",
        email: "41898282+github-actions[bot]@users.noreply.github.com",
      }),
    ).toBe(true);
    expect(gate.isReleaseBotCommit({ name: "Ashik Nesin", email: "github@ashiknesin.com" })).toBe(
      false,
    );
  }, 20_000);

  it("reds when an exports-map edit has no changeset", async () => {
    const gate = await loadGate();
    const before = JSON.stringify({
      name: "@groot/core",
      version: "1.0.0",
      exports: { ".": "./src/index.ts" },
    });
    const after = JSON.stringify({
      name: "@groot/core",
      version: "1.0.0",
      exports: { ".": "./src/index.ts", "./feature-flags": "./src/feature-flags/index.ts" },
    });
    expect(gate.pkgJsonChangeIsReleaseRelevant(before, after)).toBe(true);
    const { state } = await collectFixture(
      { "packages/core/package.json": CORE_PKG },
      ["packages/core/package.json"],
      [],
    );
    // The CLI path reconstructs both blobs from the diff; simulate the same
    // release-relevant entry through collect with explicit blobs.
    const dir = fixtureTree({ "packages/core/package.json": after });
    try {
      const withBlobs = gate.collect({
        rootDir: dir,
        changedFiles: ["packages/core/package.json"],
        changedEntries: [
          { file: "packages/core/package.json", pkgJsonBefore: before, pkgJsonAfter: after },
        ],
        changesetFiles: [],
        noReleaseReason: null,
      });
      expect(withBlobs.managedPackages).toEqual(["@groot/core"]);
      const verdict = gate.evaluate(withBlobs);
      expect(verdict.status).toBe(1);
      expect(verdict.err).toContain("missing changeset for @groot/core");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    void state;
  }, 20_000);

  it("ignores a version-only package.json bump", async () => {
    const gate = await loadGate();
    const before = JSON.stringify({
      name: "@groot/core",
      version: "1.0.0",
      exports: { ".": "./src/index.ts" },
    });
    const after = JSON.stringify({
      name: "@groot/core",
      version: "1.1.0",
      exports: { ".": "./src/index.ts" },
    });
    expect(gate.pkgJsonChangeIsReleaseRelevant(before, after)).toBe(false);
    const dir = fixtureTree({ "packages/core/package.json": after });
    try {
      const state = gate.collect({
        rootDir: dir,
        changedFiles: ["packages/core/package.json"],
        changedEntries: [
          { file: "packages/core/package.json", pkgJsonBefore: before, pkgJsonAfter: after },
        ],
        changesetFiles: [],
        noReleaseReason: null,
      });
      expect(state.managedPackages).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it("exits 0 when the branch touches no managed surface", () => {
    const run = runGate(["--base", "HEAD"]);
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("no managed package surface changed");
  }, 30_000);
});
