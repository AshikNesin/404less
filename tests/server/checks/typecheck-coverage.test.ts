import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

/**
 * Typecheck coverage guard (scripts/check-typecheck-coverage.ts).
 *
 * The script enumerates every .ts and .tsx file under apps/web/src and
 * packages/<name>/src and fails when one is a member of no checked project.
 * A file that no script or CI step reaches escapes silently, which is how
 * the never-exported @groot/ui tooltip component went unchecked. The guard
 * runs in CI as its own step, so a regression here reds the build, not just
 * a local run.
 */

const repoRoot = process.cwd();
const SCRIPT = path.join("scripts", "check-typecheck-coverage.ts");
const TIMEOUT = 120_000;

function runCoverageScript(): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("pnpm", ["exec", "tsx", SCRIPT], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: TIMEOUT,
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

describe("typecheck coverage", () => {
  it(
    "owns every source file at head",
    () => {
      const run = runCoverageScript();
      expect(run.status).toBe(0);
      // The count is a function of the tree, not a constant of the repo.
      // Matching N/N keeps the assertion true for any file count while
      // still requiring full coverage.
      expect(run.stdout).toMatch(/(\d+)\/\1 source files covered/);
    },
    TIMEOUT,
  );

  it(
    "typechecks repo-owned declarations",
    () => {
      const broken = path.join(repoRoot, "packages/ai/src/audit-broken.d.ts");
      writeFileSync(
        broken,
        'declare module "__audit_broken__" {\n  export const broken: numbr;\n}\n',
      );
      try {
        const run = runCoverageScript();
        expect(run.status).toBe(1);
        expect(run.stderr).toContain("packages/ai/src/audit-broken.d.ts");
      } finally {
        rmSync(broken, { force: true });
      }
    },
    TIMEOUT,
  );

  it(
    "names an unowned source file",
    () => {
      const orphan = path.join(repoRoot, "packages/ui/src/orphan-coverage-probe.tsx");
      writeFileSync(orphan, "export function Orphan() {\n  return null;\n}\n");
      try {
        const run = runCoverageScript();
        expect(run.status).toBe(1);
        expect(run.stderr).toContain("packages/ui/src/orphan-coverage-probe.tsx");
      } finally {
        rmSync(orphan, { force: true });
      }
    },
    TIMEOUT,
  );
});
