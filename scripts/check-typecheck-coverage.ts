#!/usr/bin/env tsx
/**
 * Typecheck coverage guard over the enumerated roots (apps/web/src and
 * packages/<name>/src).
 *
 * A source file with no importers and no tsconfig include escapes every
 * checked project silently. This repo shipped that defect: 9e5602a claimed
 * to restore the @groot/ui tooltip barrel export, but tooltip.tsx (added in
 * e997f40) had never been exported from the barrel at all, and nothing
 * failed until this guard existed.
 *
 * What this guard owns: every .ts and .tsx file under the enumerated roots
 * must be a member of at least one program that CI typechecks (the root
 * tsconfig.json, apps/web/tsconfig.json and the kit-consumer fixture), and every repo-owned .d.ts
 * under those roots must pass a dedicated declarations pass. Membership is
 * what tsc actually compiles: include globs plus the import closure. A file
 * matched by a package tsconfig that no script or CI step runs does not
 * count.
 *
 * What this guard does not own: tests/, scripts/, apps/web/drizzle/, and any
 * package directory without a src/ are outside the roots. Files there are
 * invisible to every gate. Adopting them is a follow-up, not a silent
 * default.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The kit-consumer fixture (`pnpm typecheck:kit`) imports every public kit
// entrypoint, so kit code is covered whether or not an app uses it: a child
// that never mounts jobs or storage still typechecks them.
const CHECKED_PROJECTS = [
  "tsconfig.json",
  "apps/web/tsconfig.json",
  "tests/kit-consumers/tsconfig.json",
];
const SOURCE_EXTENSION = /\.(ts|tsx)$/;
const DECLARATION_EXTENSION = /\.d\.ts$/;

function toRepoRelative(absolutePath: string): string {
  return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
}

/** Files the compiler actually loads for a project: include set + imports. */
function programFiles(configPath: string): Set<string> {
  const absolute = path.join(repoRoot, configPath);
  const read = ts.readConfigFile(absolute, ts.sys.readFile);
  if (read.error) {
    throw new Error(
      `${configPath}: ${ts.flattenDiagnosticMessageText(read.error.messageText, " ")}`,
    );
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(absolute));
  if (parsed.errors.length > 0) {
    const messages = parsed.errors.map((error) =>
      ts.flattenDiagnosticMessageText(error.messageText, " "),
    );
    throw new Error(`${configPath}: ${messages.join("; ")}`);
  }
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: { ...parsed.options, noEmit: true, skipLibCheck: true },
    projectReferences: parsed.projectReferences,
  });
  return new Set(program.getSourceFiles().map((file) => toRepoRelative(file.fileName)));
}

/** The roots this guard enumerates. Anything outside them is unowned. */
function sourceRoots(): string[] {
  const packages = fs
    .readdirSync(path.join(repoRoot, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}/src`)
    .filter((root) => fs.existsSync(path.join(repoRoot, root)));
  return ["apps/web/src", ...packages];
}

function listSourceFiles(): { sources: string[]; declarations: string[] } {
  const sources: string[] = [];
  const declarations: string[] = [];
  for (const root of sourceRoots()) {
    const queue = [root];
    while (queue.length > 0) {
      const dir = queue.shift()!;
      for (const entry of fs.readdirSync(path.join(repoRoot, dir), { withFileTypes: true })) {
        const relative = `${dir}/${entry.name}`;
        if (entry.isDirectory()) queue.push(relative);
        else if (DECLARATION_EXTENSION.test(entry.name)) declarations.push(relative);
        else if (SOURCE_EXTENSION.test(entry.name)) sources.push(relative);
      }
    }
  }
  return { sources: sources.sort(), declarations: declarations.sort() };
}

/**
 * Repo-owned declarations are members of the checked programs, but both
 * tsconfigs set skipLibCheck: true, so no program reports their errors. This
 * pass is the only thing in the repo that typechecks them, one program per
 * checked config because the two configs disagree on lib and DOM types.
 * Diagnostics are requested per repo-owned file, not program-wide: a
 * program-wide pass would also diagnose every third-party .d.ts the
 * declarations import, which is skipLibCheck's job, not this guard's.
 */
function declarationDiagnostics(declarations: string[]): string[] {
  const failures: string[] = [];
  for (const configPath of CHECKED_PROJECTS) {
    const absolute = path.join(repoRoot, configPath);
    const read = ts.readConfigFile(absolute, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(absolute));
    const program = ts.createProgram({
      rootNames: declarations.map((file) => path.join(repoRoot, file)),
      options: { ...parsed.options, noEmit: true, skipLibCheck: false },
    });
    for (const file of declarations) {
      const source = program.getSourceFile(path.join(repoRoot, file));
      if (!source) {
        failures.push(`${file}: not loaded by the declarations pass`);
        continue;
      }
      const diagnostics = [
        ...program.getSyntacticDiagnostics(source),
        ...program.getSemanticDiagnostics(source),
      ];
      for (const diagnostic of diagnostics) {
        const line = source.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1;
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
        failures.push(`${file}:${line}: ${message}`);
      }
    }
    if (failures.length > 0) return failures;
  }
  return failures;
}

const checked = new Set<string>();
for (const project of CHECKED_PROJECTS) {
  for (const file of programFiles(project)) checked.add(file);
}

const { sources, declarations } = listSourceFiles();
const unowned = sources.filter((file) => !checked.has(file));
const brokenDeclarations = declarationDiagnostics(declarations);

console.log(
  `${sources.length - unowned.length}/${sources.length} source files covered by ${CHECKED_PROJECTS.length} typecheck projects (roots: ${sourceRoots().join(", ")})`,
);
if (unowned.length > 0) {
  for (const file of unowned) {
    console.error(`not covered by any checked typecheck project: ${file}`);
  }
  process.exit(1);
}
if (brokenDeclarations.length > 0) {
  for (const failure of brokenDeclarations) {
    console.error(`declaration failed typecheck: ${failure}`);
  }
  process.exit(1);
}
