import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

/**
 * Kit export guard (scripts/check-kit-exports.ts).
 *
 * The script keeps the explicit exports maps of @groot/ui, @groot/jobs and
 * @groot/ai in
 * agreement with their source files and with the imports of the compiled
 * consumer fixture. A new module, a removed subpath, or a fixture that stops
 * exercising a subpath must fail a check, because the fixture is what forces
 * the removal deliberation recorded in AGENTS.md.
 */

const repoRoot = process.cwd();
const SCRIPT = path.join("scripts", "check-kit-exports.ts");
const TIMEOUT = 60_000;

function runGuard(): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("pnpm", ["exec", "tsx", SCRIPT], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: TIMEOUT,
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

describe("kit exports guard", () => {
  it(
    "agrees with the fixture at head",
    () => {
      const run = runGuard();
      expect(run.stderr).toBe("");
      expect(run.status).toBe(0);
      expect(run.stdout).toContain("kit exports and consumer fixture agree");
    },
    TIMEOUT,
  );

  it(
    "fails when an exports entry loses its fixture import",
    () => {
      const fixture = path.join(repoRoot, "tests/kit-consumers/consumer.tsx");
      const original = fs.readFileSync(fixture, "utf8");
      // Drop one barrel import so the "." entry stops being exercised.
      const mutated = original.replace(/import \{ Button as ButtonFromBarrel[^\n]*\n/, "");
      expect(mutated).not.toBe(original);
      fs.writeFileSync(fixture, mutated);
      try {
        const run = runGuard();
        expect(run.status).toBe(1);
        expect(run.stderr).toContain("public but the kit fixture never imports it");
      } finally {
        fs.writeFileSync(fixture, original);
      }
    },
    TIMEOUT,
  );

  it(
    "fails when a source module has no exports entry",
    () => {
      const modulePath = path.join(repoRoot, "packages/ui/src/kit-guard-probe.tsx");
      fs.writeFileSync(modulePath, "export function KitGuardProbe() {\n  return null;\n}\n");
      try {
        const run = runGuard();
        expect(run.status).toBe(1);
        expect(run.stderr).toContain("kit-guard-probe");
      } finally {
        fs.rmSync(modulePath, { force: true });
      }
    },
    TIMEOUT,
  );

  it(
    "fails when the exports map reintroduces a wildcard",
    () => {
      const manifest = path.join(repoRoot, "packages/jobs/package.json");
      const original = fs.readFileSync(manifest, "utf8");
      const pkg = JSON.parse(original);
      pkg.exports["./*"] = "./src/*";
      fs.writeFileSync(manifest, JSON.stringify(pkg, null, 2) + "\n");
      try {
        const run = runGuard();
        expect(run.status).toBe(1);
        expect(run.stderr).toContain('wildcard export "./*"');
      } finally {
        fs.writeFileSync(manifest, original);
      }
    },
    TIMEOUT,
  );
});
