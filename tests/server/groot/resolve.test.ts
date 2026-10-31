import { describe, it, expect, beforeEach, afterEach } from "vite-plus/test";
import { rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { runSync } from "../../../.groot/lib/engine";
import { openMergeBase, readManifest } from "../../../.groot/lib/sync-state";
import { ensureMarkers } from "../../../.groot/resolve";
import {
  TIMEOUT,
  CORE_FILE,
  commitAll,
  coreContent,
  createFixture,
  write,
  type Fixture,
} from "./fixture";

/**
 * groot:resolve rebuilds conflict markers when sync ran with
 * --skip-conflicts (CI), reading the merge base through the same lookup sync
 * uses.
 */
describe("groot resolve marker regeneration (integration)", () => {
  let fx: Fixture;

  beforeEach(async () => {
    fx = await createFixture();
    await write(fx.child, CORE_FILE, coreContent("7", "2"));
    await commitAll(fx.child, "local change");
    await write(fx.bp, CORE_FILE, coreContent("8", "2"));
    await commitAll(fx.bp, "upstream change");
    await runSync(fx.child, { mode: "apply", skipConflicts: true, force: false });
  });

  afterEach(async () => {
    await rm(fx.root, { recursive: true, force: true });
  });

  it(
    "writes diff3 markers with the last-sync base",
    async () => {
      const manifest = (await readManifest(fx.child))!;
      expect(manifest.conflicts.map((c) => c.file)).toEqual([CORE_FILE]);

      const state = await ensureMarkers(CORE_FILE, fx.child, manifest, {
        dir: async () => fx.bp,
        base: () => openMergeBase(fx.child, fx.bp, manifest.fromCommit),
      });
      expect(state).toBe("ready");

      const content = await readFile(join(fx.child, CORE_FILE), "utf-8");
      expect(content).toMatch(/^<{7} .*\(current_repo\)\nexport const a = 7;$/m);
      expect(content).toMatch(/^\|{7} .*\(last_sync\)\nexport const a = 1;$/m);
      expect(content).toMatch(/^export const a = 8;\n>{7} .*\(groot_boilerplate\)$/m);
    },
    TIMEOUT,
  );

  it(
    "falls back to two-way markers when no base can be found",
    async () => {
      const manifest = (await readManifest(fx.child))!;
      await ensureMarkers(CORE_FILE, fx.child, manifest, {
        dir: async () => fx.bp,
        base: async () => null,
      });

      const content = await readFile(join(fx.child, CORE_FILE), "utf-8");
      expect(content).toContain("<<<<<<<");
      expect(content).not.toContain("|||||||");
    },
    TIMEOUT,
  );
});
