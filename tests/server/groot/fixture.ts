import { mkdtemp, mkdir, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";

/**
 * Fixture git repos for the groot tooling suites: a throwaway "boilerplate"
 * repo and a "child" clone in a temp dir. The tools acquire the boilerplate
 * over file:// exactly like production.
 */

const exec = promisify(execFile);
export const TIMEOUT = 60_000;

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@localhost",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@localhost",
  // Ignore the developer's global/system config so tests are hermetic.
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

export async function git(dir: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec("git", ["-C", dir, ...args], { env: GIT_ENV });
  return stdout.trim();
}

export async function write(root: string, file: string, content: string): Promise<void> {
  const dest = join(root, file);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, content);
}

export async function commitAll(dir: string, message: string): Promise<string> {
  await git(dir, "add", "-A");
  await git(dir, "commit", "-m", message);
  return git(dir, "rev-parse", "HEAD");
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export const CORE_FILE = "packages/core/src/util.ts";
export const DOC_FILE = "docs/guide.md";
export const APP_FILE = "apps/web/src/server/api/todo.ts";

/**
 * Core fixture file with the two editable lines far apart, so single-line
 * edits on different lines land in separate diff3 hunks and merge cleanly.
 */
export const coreContent = (a: string, b: string): string =>
  [
    `export const a = ${a};`,
    "",
    "export function helper(): number {",
    "  return 0;",
    "}",
    "",
    `export const b = ${b};`,
    "",
  ].join("\n");

export interface Fixture {
  root: string;
  bp: string;
  child: string;
  baseCommit: string;
  /** Unique boilerplate name so acquireBoilerplate never reuses ~/Code/<name>. */
  name: string;
}

/** Boilerplate at commit1 + child cloned from it with sync config committed. */
export async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "groot-sync-test-"));
  const bp = join(root, "boilerplate");
  const child = join(root, "child");

  await mkdir(bp, { recursive: true });
  await git(bp, "init", "-b", "main");
  await write(bp, CORE_FILE, coreContent("1", "2"));
  await write(bp, DOC_FILE, "# Guide\n");
  await write(bp, APP_FILE, "export const todo = true;\n");
  const baseCommit = await commitAll(bp, "initial boilerplate");

  await exec("git", ["clone", "-q", bp, child], { env: GIT_ENV });

  const name = `groot-fixture-${randomBytes(6).toString("hex")}`;
  await write(
    child,
    ".groot/boilerplate-sync.json",
    JSON.stringify(
      {
        boilerplate: { name, repo: `file://${bp}` },
        last_sync: { commit: baseCommit, date: new Date().toISOString() },
        additional_exclusions: [],
      },
      null,
      2,
    ) + "\n",
  );
  await commitAll(child, "add sync config");

  return { root, bp, child, baseCommit, name };
}
