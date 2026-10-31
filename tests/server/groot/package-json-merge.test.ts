import { describe, it, expect } from "vite-plus/test";
import {
  mergePackageJson,
  mergeObject3Way,
  detectIndent,
  PACKAGE_JSON_MERGE_KEYS,
} from "../../../.groot/lib/package-json-merge";

/**
 * Deterministic package.json merge — what sync's reconcile step uses for the
 * root package.json instead of `git merge-file`, so project-owned keys never
 * raise conflict markers. A malformed package.json breaks the whole
 * toolchain, so this logic must be airtight.
 */

describe("mergeObject3Way", () => {
  it("keeps locally-changed keys (local wins)", () => {
    const merged = mergeObject3Way(
      { express: "^5.0.0", zod: "^3.0.0" },
      { express: "^3.0.0", zod: "^3.0.0" },
      { express: "^3.1.0", zod: "^3.2.0" },
    );
    expect(merged.express).toBe("^5.0.0"); // local changed -> local wins
    expect(merged.zod).toBe("^3.2.0"); // unmodified locally -> adopt theirs
  });

  it("accepts upstream deletion of an unmodified key", () => {
    const merged = mergeObject3Way(
      { build: "vite", dev: "vite" },
      { build: "vite", dev: "vite" },
      {
        dev: "vite",
      },
    );
    expect("build" in merged).toBe(false);
  });

  it("keeps a locally-deleted key deleted (local wins)", () => {
    const merged = mergeObject3Way({}, { vitest: "^1.0.0" }, { vitest: "^2.0.0" });
    expect("vitest" in merged).toBe(false);
  });

  it("adds net-new keys introduced only by theirs", () => {
    const merged = mergeObject3Way({ a: "1" }, { a: "1" }, { a: "1", b: "2" });
    expect(merged.b).toBe("2");
  });

  it("preserves ours key ordering, appending theirs-only keys last", () => {
    const merged = mergeObject3Way(
      { z: "1", a: "2" },
      { z: "1", a: "2" },
      { z: "1", a: "2", m: "3" },
    );
    expect(Object.keys(merged)).toEqual(["z", "a", "m"]);
  });
});

describe("mergePackageJson", () => {
  const j = (o: unknown, indent = 2) => JSON.stringify(o, null, indent) + "\n";

  it("merges only scripts/dependencies/devDependencies", () => {
    const r = mergePackageJson(
      j({ name: "app", version: "1.0.0", scripts: { a: "1" }, dependencies: { x: "^1" } }),
      j({ name: "app", version: "1.0.0", scripts: { a: "1" }, dependencies: { x: "^1" } }),
      j({
        name: "groot",
        version: "2.0.0",
        scripts: { a: "1", b: "2" },
        dependencies: { x: "^2" },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = JSON.parse(r.text);
    expect(out.name).toBe("app"); // project-owned, untouched
    expect(out.version).toBe("1.0.0"); // project-owned, untouched
    expect(out.scripts).toEqual({ a: "1", b: "2" }); // upstream addition adopted
    expect(out.dependencies.x).toBe("^2"); // unmodified locally -> upstream bump adopted
  });

  it("preserves a local version bump and adopts an upstream addition + bump", () => {
    const r = mergePackageJson(
      j({ dependencies: { express: "^5.0.0", zod: "^3.0.0" } }),
      j({ dependencies: { express: "^3.0.0", zod: "^3.0.0" } }),
      j({ dependencies: { express: "^3.0.0", zod: "^3.2.0", "@biomejs/biome": "^1.0.0" } }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = JSON.parse(r.text);
    expect(out.dependencies.express).toBe("^5.0.0"); // local wins
    expect(out.dependencies.zod).toBe("^3.2.0"); // unmodified -> adopt theirs
    expect(out.dependencies["@biomejs/biome"]).toBe("^1.0.0"); // theirs-only added
  });

  it("preserves a local-only key even when groot lacks it", () => {
    const r = mergePackageJson(
      j({ scripts: { "my:task": "echo hi", dev: "vite" } }),
      j({ scripts: { dev: "vite" } }),
      j({ scripts: { dev: "vite" } }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.parse(r.text).scripts["my:task"]).toBe("echo hi");
  });

  it("accepts upstream deletion of an unmodified key", () => {
    const r = mergePackageJson(
      j({ scripts: { build: "vite build", dev: "vite" } }),
      j({ scripts: { build: "vite build", dev: "vite" } }),
      j({ scripts: { dev: "vite" } }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("build" in JSON.parse(r.text).scripts).toBe(false);
  });

  it("keeps a locally-deleted shared key deleted", () => {
    const r = mergePackageJson(
      j({ devDependencies: {} }),
      j({ devDependencies: { vitest: "^1.0.0" } }),
      j({ devDependencies: { vitest: "^2.0.0" } }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.parse(r.text).devDependencies).toBeUndefined();
  });

  it("drops an empty managed section instead of leaving {}", () => {
    const r = mergePackageJson(
      j({ dependencies: { x: "^1" }, devDependencies: {} }),
      j({ dependencies: { x: "^1" }, devDependencies: {} }),
      j({ dependencies: { x: "^1" }, devDependencies: {} }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("devDependencies" in JSON.parse(r.text)).toBe(false);
  });

  it("leaves project metadata byte-identical", () => {
    const ours = j({
      name: "finance-api",
      version: "4.7.0",
      private: true,
      type: "module",
      engines: { node: "20" },
      packageManager: "pnpm@9.0.0",
      scripts: { dev: "vite" },
    });
    const r = mergePackageJson(
      ours,
      j({ scripts: { dev: "old" } }),
      j({ scripts: { dev: "new" } }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = JSON.parse(r.text);
    expect(out.name).toBe("finance-api");
    expect(out.version).toBe("4.7.0");
    expect(out.private).toBe(true);
    expect(out.type).toBe("module");
    expect(out.engines).toEqual({ node: "20" });
    expect(out.packageManager).toBe("pnpm@9.0.0");
  });

  it("preserves 2-space indentation", () => {
    const r = mergePackageJson(
      j({ scripts: { a: "1" } }),
      j({ scripts: { a: "1" } }),
      j({
        scripts: { a: "2" },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toContain('\n  "scripts"');
  });

  it("preserves 4-space indentation", () => {
    const r = mergePackageJson(
      j({ scripts: { a: "1" } }, 4),
      j({ scripts: { a: "1" } }, 4),
      j(
        {
          scripts: { a: "2" },
        },
        4,
      ),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toContain('\n    "scripts"');
  });

  it("preserves tab indentation", () => {
    const tabbed = JSON.stringify({ scripts: { a: "1" } }, null, "\t") + "\n";
    const r = mergePackageJson(
      tabbed,
      JSON.stringify({ scripts: { a: "1" } }, null, "\t"),
      JSON.stringify({ scripts: { a: "2" } }, null, "\t"),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toContain('\n\t"scripts"');
  });

  it("preserves the trailing newline when present", () => {
    const r = mergePackageJson(
      JSON.stringify({ scripts: { a: "1" } }) + "\n",
      JSON.stringify({ scripts: { a: "1" } }) + "\n",
      JSON.stringify({ scripts: { a: "2" } }) + "\n",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text.endsWith("\n")).toBe(true);
  });

  it("omits the trailing newline when absent", () => {
    const r = mergePackageJson(
      JSON.stringify({ scripts: { a: "1" } }),
      JSON.stringify({ scripts: { a: "1" } }),
      JSON.stringify({ scripts: { a: "2" } }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text.endsWith("\n")).toBe(false);
  });

  it("falls back when a side is not valid JSON", () => {
    const r = mergePackageJson("{ broken", "{}", "{}");
    expect(r.ok).toBe(false);
  });

  it("falls back when a side is not a JSON object", () => {
    const r = mergePackageJson("[]", "{}", "{}");
    expect(r.ok).toBe(false);
  });

  it("falls back when a managed section is not an object", () => {
    const r = mergePackageJson(
      j({ scripts: "not-an-object" }),
      j({ scripts: { a: "1" } }),
      j({ scripts: { a: "2" } }),
    );
    expect(r.ok).toBe(false);
  });
});

describe("module exports", () => {
  it("only manages scripts, dependencies, and devDependencies", () => {
    expect([...PACKAGE_JSON_MERGE_KEYS]).toEqual(["scripts", "dependencies", "devDependencies"]);
  });

  it("detectIndent infers 2-space and 4-space", () => {
    expect(detectIndent('{\n  "a": 1\n}')).toBe("  ");
    expect(detectIndent('{\n    "a": 1\n}')).toBe("    ");
    expect(detectIndent('{\n\t"a": 1\n}')).toBe("\t");
  });
});
