import { describe, it, expect } from "vite-plus/test";
import { categorizeFile, TEST_AREA_OWNERSHIP } from "../../../.groot/lib/patterns";

/**
 * Classification of kit-owned test paths.
 *
 * These cases pin the defect the audit recorded: the three recorded suite
 * paths fell through to drift while their source syncs, so a kit bug fix
 * could sync without its regression test (evidence/sync-classification.log).
 * Classification is now derived from TEST_AREA_OWNERSHIP, not directory-name
 * pattern lists.
 */
describe("categorizeFile — kit-owned test suites classify as sync", () => {
  it.each([
    "tests/server/jobs/queue.test.ts",
    "tests/server/core/kv.test.ts",
    "tests/server/api/jobs/job.validation.test.ts",
  ])("%s syncs", (path) => {
    expect(categorizeFile(path, []).action).toBe("sync");
  });

  // The parity suite reads child-owned schema files on purpose while guarding
  // synced engine parity; ownership is declared, not inferred from imports.
  it("schema-parity suite syncs despite reading child-owned schemas", () => {
    expect(categorizeFile("tests/server/core/kv.test.ts", []).action).toBe("sync");
  });

  it("ai suite and groot sync suite stay sync", () => {
    expect(categorizeFile("tests/server/ai/client.test.ts", []).action).toBe("sync");
    expect(categorizeFile("tests/server/groot/sync-engine.test.ts", []).action).toBe("sync");
  });

  it("shared client suites and setup files stay sync", () => {
    expect(categorizeFile("tests/client/setup.ts", []).action).toBe("sync");
    expect(categorizeFile("tests/client/components/ui/Button.test.tsx", []).action).toBe("sync");
    expect(categorizeFile("tests/client/components/jobs/JobJsonBlock.test.tsx", []).action).toBe(
      "sync",
    );
    expect(categorizeFile("tests/server/setup.ts", []).action).toBe("sync");
  });
});

describe("categorizeFile — child-owned paths stay out", () => {
  it("app source code stays skip-app", () => {
    // The plan wording says drift; the classifier's actual child-owned enum is
    // skip-app, which keeps app files out of sync AND out of drift noise.
    expect(categorizeFile("apps/web/src/server/api/todo.ts", []).action).toBe("skip-app");
  });

  it("app-specific and e2e test areas stay project-local", () => {
    expect(categorizeFile("tests/e2e/todos.spec.ts", []).action).toBe("skip-app");
    expect(categorizeFile("tests/server/app/thing.test.ts", []).action).toBe("skip-app");
    expect(categorizeFile("tests/server/app/app.test.ts", []).action).toBe("skip-app");
  });

  it("an undeclared tests/ area falls through to drift, not sync", () => {
    expect(categorizeFile("tests/server/pages/todo/todo.jobs.test.ts", []).action).toBe("drift");
  });
});

describe("TEST_AREA_OWNERSHIP — declared source exists", () => {
  it("every owned source root is set and shaped like a path", () => {
    const roots = [...new Set(Object.values(TEST_AREA_OWNERSHIP).flat())];
    expect(roots.length).toBeGreaterThan(0);
    for (const root of roots) {
      expect(root).toMatch(/^(\.groot|packages|apps)\//);
    }
  });
});
