import { describe, it, expect, beforeEach, afterEach } from "vite-plus/test";
import { rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { runSync } from "../../../.groot/lib/engine";
import { readBaselineInfo, BASELINE_REF } from "../../../.groot/lib/baseline";
import {
  TIMEOUT,
  APP_FILE,
  CORE_FILE,
  DOC_FILE,
  commitAll,
  coreContent,
  createFixture,
  exists,
  git,
  write,
  type Fixture,
} from "./fixture";

/**
 * Integration tests for groot sync v5 against real fixture git repos.
 *
 * Each scenario exercises the full pipeline: candidate discovery, three-way
 * reconciliation, apply, baseline ref advancement, and report/manifest output.
 */

describe("groot sync engine (integration)", () => {
  let fx: Fixture;

  beforeEach(async () => {
    fx = await createFixture();
  });

  afterEach(async () => {
    await rm(fx.root, { recursive: true, force: true });
  });

  it(
    "check mode reports changes without touching the working tree",
    async () => {
      await write(fx.bp, CORE_FILE, coreContent("100", "2"));
      await write(fx.bp, "packages/core/src/new.ts", "export const fresh = true;\n");
      await rm(join(fx.bp, DOC_FILE));
      await write(fx.bp, APP_FILE, "export const todo = false;\n");
      await commitAll(fx.bp, "upstream changes");

      const result = await runSync(fx.child, {
        mode: "check",
        skipConflicts: false,
        force: false,
      });

      expect(result.autoApply.map((f) => f.file).sort()).toEqual([
        "packages/core/src/new.ts",
        CORE_FILE,
      ]);
      expect(result.deleted).toEqual([DOC_FILE]);
      expect(result.conflicts).toEqual([]);
      expect(result.skipped.appSpecific).toContain(APP_FILE);

      // Working tree untouched in check mode
      expect(await readFile(join(fx.child, CORE_FILE), "utf-8")).toContain("const a = 1;");
      expect(await exists(join(fx.child, DOC_FILE))).toBe(true);
      expect(await exists(join(fx.child, "packages/core/src/new.ts"))).toBe(false);
      expect(await readBaselineInfo(fx.child)).toBeNull();

      // Machine-readable report exists (CI depends on it)
      const report = JSON.parse(await readFile(join(fx.child, ".groot/sync-report.json"), "utf-8"));
      expect(report.autoApply).toHaveLength(2);
      expect(report.deleted).toEqual([DOC_FILE]);
    },
    TIMEOUT,
  );

  it(
    "apply updates files, syncs deletions, advances the baseline, and is idempotent",
    async () => {
      await write(fx.bp, CORE_FILE, coreContent("100", "2"));
      await write(fx.bp, "packages/core/src/new.ts", "export const fresh = true;\n");
      await rm(join(fx.bp, DOC_FILE));
      const target = await commitAll(fx.bp, "upstream changes");

      const result = await runSync(fx.child, {
        mode: "apply",
        skipConflicts: false,
        force: false,
      });
      expect(result.autoApply).toHaveLength(2);
      expect(result.deleted).toEqual([DOC_FILE]);

      expect(await readFile(join(fx.child, CORE_FILE), "utf-8")).toContain("const a = 100;");
      expect(await exists(join(fx.child, "packages/core/src/new.ts"))).toBe(true);
      expect(await exists(join(fx.child, DOC_FILE))).toBe(false);

      const baseline = await readBaselineInfo(fx.child);
      expect(baseline?.boilerplateCommit).toBe(target);
      // Baseline snapshot holds synced files only
      const tree = await git(fx.child, "ls-tree", "-r", "--name-only", BASELINE_REF);
      expect(tree).toContain(CORE_FILE);
      expect(tree).not.toContain(APP_FILE);

      const config = JSON.parse(
        await readFile(join(fx.child, ".groot/boilerplate-sync.json"), "utf-8"),
      );
      expect(config.last_sync.commit).toBe(target);

      // Second run: nothing left to do
      await git(fx.child, "add", "-A");
      await git(fx.child, "commit", "-m", "adopt sync");
      const again = await runSync(fx.child, { mode: "apply", skipConflicts: false, force: false });
      expect(again.autoApply).toEqual([]);
      expect(again.autoMerged).toEqual([]);
      expect(again.conflicts).toEqual([]);
      expect(again.deleted).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    "preserves local changes via 3-way merge and raises real conflicts",
    async () => {
      // Local: change the last line (committed)
      await write(fx.child, CORE_FILE, coreContent("1", "999"));
      await commitAll(fx.child, "local customization");
      // Upstream: change the first line → non-overlapping, should auto-merge
      await write(fx.bp, CORE_FILE, coreContent("42", "2"));
      await commitAll(fx.bp, "upstream change");

      const merged = await runSync(fx.child, {
        mode: "apply",
        skipConflicts: false,
        force: false,
      });
      expect(merged.autoMerged.map((f) => f.file)).toEqual([CORE_FILE]);
      const content = await readFile(join(fx.child, CORE_FILE), "utf-8");
      expect(content).toContain("const a = 42;");
      expect(content).toContain("const b = 999;");
      await commitAll(fx.child, "adopt merge");

      // Now both sides touch the same line → genuine conflict with markers
      await write(fx.child, CORE_FILE, coreContent("7", "999"));
      await commitAll(fx.child, "local conflicting change");
      await write(fx.bp, CORE_FILE, coreContent("8", "2"));
      await commitAll(fx.bp, "upstream conflicting change");

      const conflicted = await runSync(fx.child, {
        mode: "apply",
        skipConflicts: false,
        force: false,
      });
      expect(conflicted.conflicts.map((c) => c.file)).toEqual([CORE_FILE]);
      const withMarkers = await readFile(join(fx.child, CORE_FILE), "utf-8");
      expect(withMarkers).toContain("<<<<<<<");
      expect(withMarkers).toContain(">>>>>>>");

      const manifest = JSON.parse(
        await readFile(join(fx.child, ".groot/needs-review/manifest.json"), "utf-8"),
      );
      expect(manifest.conflicts[0].file).toBe(CORE_FILE);
    },
    TIMEOUT,
  );

  it(
    "--skip-conflicts records the conflict without writing markers",
    async () => {
      await write(fx.child, CORE_FILE, coreContent("7", "2"));
      await commitAll(fx.child, "local change");
      await write(fx.bp, CORE_FILE, coreContent("8", "2"));
      await commitAll(fx.bp, "upstream change");

      const result = await runSync(fx.child, {
        mode: "apply",
        skipConflicts: true,
        force: false,
      });
      expect(result.conflicts.map((c) => c.file)).toEqual([CORE_FILE]);

      const content = await readFile(join(fx.child, CORE_FILE), "utf-8");
      expect(content).not.toContain("<<<<<<<");
      expect(content).toContain("const a = 7;");
      expect(await exists(join(fx.child, ".groot/needs-review/manifest.json"))).toBe(true);
    },
    TIMEOUT,
  );

  it(
    "refuses to overwrite uncommitted changes unless --force",
    async () => {
      await write(fx.bp, CORE_FILE, coreContent("100", "2"));
      await commitAll(fx.bp, "upstream change");
      // Uncommitted local edit to a different line of the same file
      await write(fx.child, CORE_FILE, coreContent("1", "3"));

      await expect(
        runSync(fx.child, { mode: "apply", skipConflicts: false, force: false }),
      ).rejects.toThrow(/uncommitted changes/);

      // Untouched by the failed run, and the baseline did not advance
      expect(await readFile(join(fx.child, CORE_FILE), "utf-8")).toContain("const b = 3;");
      expect(await readBaselineInfo(fx.child)).toBeNull();

      const forced = await runSync(fx.child, { mode: "apply", skipConflicts: false, force: true });
      expect(forced.autoMerged.map((f) => f.file)).toEqual([CORE_FILE]);
      const content = await readFile(join(fx.child, CORE_FILE), "utf-8");
      expect(content).toContain("const a = 100;");
      expect(content).toContain("const b = 3;");
    },
    TIMEOUT,
  );

  it(
    "keeps a modified file that was deleted upstream and flags it for review",
    async () => {
      await write(fx.child, DOC_FILE, "# Guide\n\nLocal additions.\n");
      await commitAll(fx.child, "local doc changes");
      await rm(join(fx.bp, DOC_FILE));
      await commitAll(fx.bp, "remove guide upstream");

      const result = await runSync(fx.child, {
        mode: "apply",
        skipConflicts: false,
        force: false,
      });
      expect(result.reviewDeletions).toEqual([DOC_FILE]);
      expect(result.deleted).toEqual([]);
      expect(await exists(join(fx.child, DOC_FILE))).toBe(true);
    },
    TIMEOUT,
  );

  it(
    "first adoption of a newly kit-owned path does not resurrect a committed deletion",
    async () => {
      // Real-world shape (verified against the finance child's
      // refs/groot/baseline): the baseline ref is written by whichever
      // classifier ran last, so a path the kit did not own at the last sync
      // has NO base entry even though the child tracks the file. When the
      // classifier later grows to own the path, the first sync sees
      // ours-missing / base-missing / theirs-present, which reconcile reads
      // as "new upstream file" → auto-apply, resurrecting a file the child
      // deliberately deleted. The child's own history is the only signal
      // that survives the classifier change, so the tracked check must run
      // on first adoption too, not only once a base exists.
      const TARGET = "tests/server/core/kv.test.ts";
      const childCfg = join(fx.child, ".groot/boilerplate-sync.json");

      const writeCfg = async (exclusions: string[]): Promise<void> => {
        await writeFile(
          childCfg,
          JSON.stringify(
            {
              boilerplate: { name: fx.name, repo: `file://${fx.bp}` },
              last_sync: { commit: fx.baseCommit, date: new Date().toISOString() },
              additional_exclusions: exclusions,
            },
            null,
            2,
          ) + "\n",
        );
      };

      // The kit ships the suite.
      await write(fx.bp, TARGET, "import { test } from 'vitest';\ntest('kv', () => {});\n");
      const kitCommit = await commitAll(fx.bp, "kit: add kv suite");

      // The child adopts it through any channel the old classifier did not
      // cover (manual merge, pre-ownership kit surface) — it is tracked.
      await write(fx.child, TARGET, "import { test } from 'vitest';\ntest('kv', () => {});\n");
      await commitAll(fx.child, "adopt kit kv suite");

      // Last sync ran with the OLD classifier surface, which did not own
      // `tests/server/core/**` (trunk owned `tests/server/{ai,core,shared}`
      // — reproduced here as a project exclusion). That sync writes the
      // baseline ref WITHOUT the path, exactly like the finance child's.
      await writeCfg(["tests/server/core/**"]);
      await runSync(fx.child, { mode: "apply", skipConflicts: false, force: false });
      await commitAll(fx.child, "sync under old classifier");
      const oldBaseline = await git(fx.child, "ls-tree", "-r", "--name-only", BASELINE_REF);
      expect(oldBaseline).not.toContain(TARGET); // the first-adoption window

      // The child deliberately drops the suite.
      await git(fx.child, "rm", "-q", TARGET);
      await commitAll(fx.child, "drop kv suite");

      // The kit (this PR) now owns the path. The child's next sync is the
      // first one where the classifier covers it.
      await writeCfg([]);
      await commitAll(fx.child, "adopt ownership classifier");

      const result = await runSync(fx.child, { mode: "apply", skipConflicts: false, force: false });

      // The deletion must win on first adoption, not only on later syncs.
      expect(result.keptLocalDeletions).toContain(TARGET);
      expect(result.autoApply.map((f) => f.file)).not.toContain(TARGET);
      expect(await exists(join(fx.child, TARGET))).toBe(false);
      expect(kitCommit).toBeTruthy();

      // And it stays dead on the next sync too (baseline now covers the path).
      await commitAll(fx.child, "after first adoption sync");
      const again = await runSync(fx.child, { mode: "apply", skipConflicts: false, force: false });
      expect(again.autoApply.map((f) => f.file)).not.toContain(TARGET);
      expect(again.keptLocalDeletions).toContain(TARGET);
      expect(await exists(join(fx.child, TARGET))).toBe(false);
    },
    TIMEOUT,
  );

  it(
    "restores a synced file that was written but never committed then swept (phantom deletion)",
    async () => {
      // Upstream ships a new synced file.
      const PHANTOM = "packages/core/src/phantom.ts";
      await write(fx.bp, PHANTOM, "export const phantom = true;\n");
      await commitAll(fx.bp, "add phantom upstream");

      // Sync lands it in the working tree (uncommitted) and advances the baseline.
      await runSync(fx.child, { mode: "apply", skipConflicts: false, force: false });
      expect(await exists(join(fx.child, PHANTOM))).toBe(true);

      // Simulate the phantom: the file was never committed and gets swept away
      // (e.g. a partial sync + `git clean -fd`). On the next run it must be
      // restored, not silently treated as an intentional deletion.
      await rm(join(fx.child, PHANTOM));

      const result = await runSync(fx.child, {
        mode: "apply",
        skipConflicts: false,
        force: false,
      });
      expect(result.autoApply.map((f) => f.file)).toContain(PHANTOM);
      expect(result.keptLocalDeletions).not.toContain(PHANTOM);
      expect(await exists(join(fx.child, PHANTOM))).toBe(true);
      expect(await readFile(join(fx.child, PHANTOM), "utf-8")).toContain("phantom = true");
    },
    TIMEOUT,
  );

  it(
    "respects a committed deletion of a synced file (real deletion, not phantom)",
    async () => {
      // A committed deletion must NOT be restored. This guards against a naive
      // `cat-file -e HEAD:path` check: a `git rm` + commit leaves the file absent
      // from the HEAD tree just like a never-tracked file, so only the repo's
      // history can tell a deliberate delete from a phantom.
      const TARGET = "packages/core/src/disposable.ts";
      await write(fx.bp, TARGET, "export const disposable = true;\n");
      await commitAll(fx.bp, "add disposable upstream");

      // Sync lands it; commit it so it's tracked in the child repo.
      await runSync(fx.child, { mode: "apply", skipConflicts: false, force: false });
      await commitAll(fx.child, "adopt disposable");

      // Deliberately delete it (committed removal).
      await rm(join(fx.child, TARGET));
      await commitAll(fx.child, "drop disposable");

      const result = await runSync(fx.child, {
        mode: "check",
        skipConflicts: false,
        force: false,
      });
      expect(result.keptLocalDeletions).toContain(TARGET);
      expect(result.autoApply.map((f) => f.file)).not.toContain(TARGET);
      expect(await exists(join(fx.child, TARGET))).toBe(false);
    },
    TIMEOUT,
  );

  it(
    "self-heals when the baseline ref is missing or stale",
    async () => {
      await write(fx.bp, CORE_FILE, coreContent("100", "2"));
      await commitAll(fx.bp, "upstream change");

      // First sync establishes the baseline
      await runSync(fx.child, { mode: "apply", skipConflicts: false, force: false });
      await git(fx.child, "add", "-A");
      await git(fx.child, "commit", "-m", "adopt sync");

      // Simulate lost state: delete the baseline ref entirely
      await git(fx.child, "update-ref", "-d", BASELINE_REF);
      expect(await readBaselineInfo(fx.child)).toBeNull();

      await write(fx.bp, CORE_FILE, coreContent("200", "2"));
      const target = await commitAll(fx.bp, "another upstream change");

      const result = await runSync(fx.child, {
        mode: "apply",
        skipConflicts: false,
        force: false,
      });
      expect(result.autoApply.map((f) => f.file)).toEqual([CORE_FILE]);
      expect(await readFile(join(fx.child, CORE_FILE), "utf-8")).toContain("const a = 200;");
      expect((await readBaselineInfo(fx.child))?.boilerplateCommit).toBe(target);
    },
    TIMEOUT,
  );
});
