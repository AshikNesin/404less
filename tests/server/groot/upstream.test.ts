import { describe, it, expect, beforeEach, afterEach } from "vite-plus/test";
import { rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { runSync, planUpstream, applyUpstream } from "../../../.groot/lib/engine";
import {
  TIMEOUT,
  APP_FILE,
  CORE_FILE,
  DOC_FILE,
  commitAll,
  coreContent,
  createFixture,
  git,
  write,
  type Fixture,
} from "./fixture";

/**
 * groot:upstream is sync with the sides swapped: the child's changes since
 * its last sync are three-way merged onto groot HEAD, so groot's own newer
 * changes survive and overlapping edits surface as conflicts.
 */
describe("groot upstream engine (integration)", () => {
  let fx: Fixture;

  beforeEach(async () => {
    fx = await createFixture();
  });

  afterEach(async () => {
    await rm(fx.root, { recursive: true, force: true });
  });

  const kinds = async (child: string, groot: string) =>
    Object.fromEntries(
      (await planUpstream(child, groot)).items.map((i) => [i.file, i.outcome.kind]),
    );

  it(
    "offers only synced files the child changed, with the child's content when groot is unchanged",
    async () => {
      await write(fx.child, CORE_FILE, coreContent("1", "999"));
      await write(fx.child, APP_FILE, "export const todo = 'local';\n");
      await commitAll(fx.child, "local changes");

      const plan = await planUpstream(fx.child, fx.bp);
      expect(plan.baseCommit).toBe(fx.baseCommit);
      expect(plan.items.map((i) => i.file)).toEqual([CORE_FILE]);

      const { written, unmerged } = await applyUpstream(fx.bp, plan.items);
      expect(unmerged).toEqual([]);
      expect(written).toEqual([CORE_FILE]);
      expect(await readFile(join(fx.bp, CORE_FILE), "utf-8")).toBe(coreContent("1", "999"));
    },
    TIMEOUT,
  );

  it(
    "keeps groot's changes made since the child's last sync",
    async () => {
      await write(fx.child, CORE_FILE, coreContent("1", "999"));
      await commitAll(fx.child, "local fix");
      await write(fx.bp, CORE_FILE, coreContent("42", "2"));
      await commitAll(fx.bp, "groot moves on");

      const plan = await planUpstream(fx.child, fx.bp);
      expect(plan.items.map((i) => [i.file, i.outcome.kind])).toEqual([[CORE_FILE, "ready"]]);

      await applyUpstream(fx.bp, plan.items);
      expect(await readFile(join(fx.bp, CORE_FILE), "utf-8")).toBe(coreContent("42", "999"));
    },
    TIMEOUT,
  );

  it(
    "reports overlapping edits as conflicts and writes nothing",
    async () => {
      await write(fx.child, CORE_FILE, coreContent("7", "2"));
      await commitAll(fx.child, "local edit");
      await write(fx.bp, CORE_FILE, coreContent("8", "2"));
      await commitAll(fx.bp, "groot edit on the same line");

      const plan = await planUpstream(fx.child, fx.bp);
      expect(plan.items.map((i) => [i.file, i.outcome.kind])).toEqual([[CORE_FILE, "conflict"]]);

      const { written, unmerged } = await applyUpstream(fx.bp, plan.items);
      expect(written).toEqual([]);
      expect(unmerged).toEqual([CORE_FILE]);
      expect(await readFile(join(fx.bp, CORE_FILE), "utf-8")).toBe(coreContent("8", "2"));
    },
    TIMEOUT,
  );

  it(
    "skips changes groot already has and flags files groot deleted",
    async () => {
      await write(fx.child, CORE_FILE, coreContent("5", "2"));
      await write(fx.child, DOC_FILE, "# Guide\n\nLocal notes.\n");
      await commitAll(fx.child, "local changes");
      await write(fx.bp, CORE_FILE, coreContent("5", "2"));
      await rm(join(fx.bp, DOC_FILE));
      await commitAll(fx.bp, "groot adopted the fix and dropped the guide");

      expect(await kinds(fx.child, fx.bp)).toEqual({ [DOC_FILE]: "deleted-in-groot" });
    },
    TIMEOUT,
  );

  it(
    "re-merges against the checkout it writes to, refusing when that no longer merges",
    async () => {
      await write(fx.child, CORE_FILE, coreContent("7", "2"));
      await commitAll(fx.child, "local edit");
      const plan = await planUpstream(fx.child, fx.bp);
      expect(plan.items.map((i) => i.outcome.kind)).toEqual(["ready"]);

      // groot moves after the plan was listed
      await write(fx.bp, CORE_FILE, coreContent("8", "2"));
      await commitAll(fx.bp, "groot edit on the same line");

      const { written, unmerged } = await applyUpstream(fx.bp, plan.items);
      expect(written).toEqual([]);
      expect(unmerged).toEqual([CORE_FILE]);
    },
    TIMEOUT,
  );

  it(
    "reads the base from the baseline snapshot when the checkout lacks the last-sync commit",
    async () => {
      await write(fx.bp, CORE_FILE, coreContent("100", "2"));
      await commitAll(fx.bp, "upstream change");
      await runSync(fx.child, { mode: "apply", skipConflicts: false, force: false });
      await commitAll(fx.child, "adopt sync");

      await write(fx.child, CORE_FILE, coreContent("100", "999"));
      await commitAll(fx.child, "local fix");

      // groot's history is rewritten: same tree, unrelated commit.
      await git(fx.bp, "checkout", "-q", "--orphan", "rewritten");
      await git(fx.bp, "commit", "-q", "-m", "rewritten history");
      const rewritten = join(fx.root, "rewritten");
      await git(
        fx.root,
        "clone",
        "-q",
        "--single-branch",
        "--branch",
        "rewritten",
        fx.bp,
        rewritten,
      );

      const plan = await planUpstream(fx.child, rewritten);
      expect(plan.items.map((i) => [i.file, i.outcome.kind])).toEqual([[CORE_FILE, "ready"]]);
      await applyUpstream(rewritten, plan.items);
      expect(await readFile(join(rewritten, CORE_FILE), "utf-8")).toBe(coreContent("100", "999"));
    },
    TIMEOUT,
  );
});
