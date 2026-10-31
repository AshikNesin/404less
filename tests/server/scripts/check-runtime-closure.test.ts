import { describe, expect, it } from "vite-plus/test";
import { checkRuntimeClosure } from "../../../scripts/check-runtime-closure.mjs";

/**
 * The closure check keeps the production artifact's dependency owner honest.
 * These cases pin the classification on a synthetic metafile, so the check
 * fails closed without a full build: an emitted external import whose package
 * is not a root production dependency is an ownership error.
 */
describe("checkRuntimeClosure", () => {
  const metafile = (imports: Array<{ path: string; kind: string }>) => ({
    outputs: { "dist/bundle.js": { imports } },
  });

  it("flags an emitted external import with no owner", () => {
    const result = checkRuntimeClosure({
      metafile: metafile([{ path: "better-sqlite3", kind: "import-statement", external: true }]),
      dependencies: new Set(["express"]),
    });

    expect(result.edgeCount).toBe(1);
    expect(result.failures).toEqual([
      "RUNTIME_DEPENDENCY better-sqlite3 (import-statement) absent from root dependencies; " +
        "declare it in the production owner or deploy that workspace's closure.",
    ]);
  });

  it("accepts an emitted import whose package is a root dependency", () => {
    const result = checkRuntimeClosure({
      metafile: metafile([{ path: "express", kind: "import-statement", external: true }]),
      dependencies: new Set(["express"]),
    });

    expect(result.failures).toEqual([]);
    expect(result.edgeCount).toBe(1);
  });

  it("accepts subpaths of an owned package", () => {
    const result = checkRuntimeClosure({
      metafile: metafile([
        { path: "@prisma/client/runtime/client", kind: "import-statement", external: true },
      ]),
      dependencies: new Set(["@prisma/client"]),
    });

    expect(result.failures).toEqual([]);
  });

  it("exempts Node builtins, prefixed and bare", () => {
    const result = checkRuntimeClosure({
      metafile: metafile([
        { path: "node:fs", kind: "import-statement", external: true },
        { path: "events", kind: "import-statement", external: true },
      ]),
      dependencies: new Set(),
    });

    expect(result.failures).toEqual([]);
    expect(result.edgeCount).toBe(2);
  });

  it("exempts the dev-only dynamic import but not its static import", () => {
    const dynamic = checkRuntimeClosure({
      metafile: metafile([{ path: "vite-plus", kind: "dynamic-import", external: true }]),
      dependencies: new Set(),
    });
    expect(dynamic.failures).toEqual([]);

    const staticImport = checkRuntimeClosure({
      metafile: metafile([{ path: "vite-plus", kind: "import-statement", external: true }]),
      dependencies: new Set(),
    });
    expect(staticImport.failures.length).toBe(1);
  });
});
