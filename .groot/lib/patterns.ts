/**
 * Single source of truth for what syncs between groot and child repos.
 *
 * The sync engine classifies with it in both directions (`groot:sync` and
 * `groot:upstream`), so the two can never disagree about what is synced.
 */
import { normalize } from "node:path";
import micromatch from "micromatch";

// ============================================================
// IMMUTABLE EXCLUSIONS - Cannot be overridden by config
// Security-critical files that must NEVER be synced/upstreamed
// ============================================================

export const IMMUTABLE_EXCLUSIONS: readonly string[] = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.*.local",
  "apps/web/drizzle/**",
  "wrangler.jsonc",
  "node_modules/**",
  "dist/**",
  ".git/**",
  "*.pem",
  "*.key",
  "secrets/**",

  // Sync tooling state — must NEVER be overwritten with the boilerplate's
  // own values (would corrupt this project's last_sync baseline).
  // Project-only docs live here too and must not be clobbered by the
  // boilerplate's copies.
  ".groot/boilerplate-sync.json",
  ".groot/sync-report.json",
  ".groot/feature-request.md",
  ".groot/repo-drift.md",

  // Conflict-resolution working state (manifest + any scratch files). This is
  // generated per-project and must never be pulled from the boilerplate.
  ".groot/needs-review/**",
] as const;

// ============================================================
// TEST AREA OWNERSHIP - Tests sync when the source they own syncs
// ============================================================

/**
 * Test areas -> synced source each area exercises. A test under `tests/`
 * syncs when it is owned by a synced source tree; it stays project-local when
 * it exercises child-owned code. This replaces directory-name pattern lists,
 * which drifted (old `tests/server/core/**`/`shared/**` areas no longer exist
 * while real areas fell through to drift, so kit bug fixes synced without
 * their regression tests).
 *
 * Ownership is declared, not inferred from imports: the source a suite
 * exercises is a maintenance fact about the suite, and inference breaks where
 * a suite reads child-owned files on purpose (the schema-parity suite reads
 * child-owned `apps/web/drizzle/**` migrations while guarding synced engine
 * parity).
 */
export const TEST_AREA_OWNERSHIP: Readonly<Record<string, readonly string[]>> = {
  // Suites exercising packages/** source.
  "tests/server/ai": ["packages/ai/src/**"],
  "tests/server/core": ["packages/core/src/**"],
  "tests/server/jobs": ["packages/jobs/src/server/**"],
  "tests/server/api": ["packages/core/src/**", "packages/jobs/src/server/**"],
  "tests/server/groot": [".groot/**"],

  // Shared client-side suites exercise @groot/ui + @groot/jobs browser code.
  "tests/client/components/ui": ["packages/ui/src/**"],
  "tests/client/components/jobs": ["packages/jobs/src/client/**"],

  // Shared setup for the client suite lives with the shell's client entry.
  "tests/client": ["packages/shell/src/**"],
};

/**
 * Source roots each owned test area relies on. Derived once so scripts that
 * need "what source does a synced test cover" (e.g. the checks-coverage
 * script) never re-encode the list by hand.
 */
export function ownedSourceRootsForTests(): string[] {
  return [...new Set(Object.values(TEST_AREA_OWNERSHIP).flat())].sort();
}

/** Test path is kit-owned when its deepest declared area contains it. */
function ownedTestPath(filePath: string): boolean {
  let bestArea = "";
  for (const area of Object.keys(TEST_AREA_OWNERSHIP)) {
    if (filePath === area || filePath.startsWith(`${area}/`)) {
      if (area.length > bestArea.length) bestArea = area;
    }
  }
  return bestArea !== "";
}

// ============================================================
// SYNC PATTERNS - Files that should be synced (and upstreamed)
// ============================================================

export const SYNC_PATTERNS: readonly string[] = [
  // All workspace packages are boilerplate (ui, shell, core, jobs, ai).
  // Child repos get the full packages/ tree; business logic lives in apps/.
  "packages/**",

  // Workspace package manifests per package.
  "apps/*/package.json",
  "apps/*/tsconfig.json",

  // Tests mirroring synced source (ownership-declared, see TEST_AREA_OWNERSHIP).
  // App-specific and e2e tests stay project-local.
  "tests/server/setup.ts",

  // Infrastructure
  "*.config.*",
  "tsconfig.json",
  "tsconfig.base.json",
  ".github/workflows/**",
  ".vite-hooks/**",
  ".gitleaks.toml",
  "scripts/**",
  "postcss.config.js",
  "components.json",

  // Deployment config (railpack) — shared by all downstream apps.
  "railpack.json",

  // Sync tooling — keep the sync tool itself up to date.
  // State files (boilerplate-sync.json, sync-report.json) and project-only
  // docs (feature-request.md, repo-drift.md) are guarded by
  // IMMUTABLE_EXCLUSIONS so only the tool's _code_ syncs.
  ".groot/**",

  // Agent skills shipped with the boilerplate.
  ".agents/skills/**",

  // Documentation
  "docs/**",

  // Environment template (not actual secrets)
  ".env.example",
] as const;

// ============================================================
// SKIP PATTERNS - App-specific code to never sync/upstream
// ============================================================

export const SKIP_PATTERNS: readonly string[] = [
  // App-owned source code (never synced).
  // Business modules, route registration, server/client entry points.
  "apps/web/src/**",

  // App-owned database migrations (generated by drizzle-kit from the app schema).
  "apps/web/drizzle/**",

  // App-owned entry file (downstream branding).
  "apps/web/index.html",

  // App-owned seed data. It imports the app's own schema (the template seeds
  // todos), so a synced copy breaks `pnpm dev` in any child without those tables.
  "scripts/seed.ts",

  // Project-local tests (app routes, end-to-end).
  "tests/server/app/**",
  "tests/e2e/**",

  // Other (project-owned docs and lockfile)
  "README.md",
  "pnpm-lock.yaml",
] as const;

// Files that don't match a sync pattern by glob but should still flow through
// the three-way merge path (their content genuinely belongs to both repos).
export const FORCE_MERGE_FILES: readonly string[] = [
  ".gitignore",
  "package.json",
  "pnpm-workspace.yaml",
] as const;

// ============================================================
// PATH VALIDATION - Security against traversal attacks
// ============================================================

const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /\.\./, // Path traversal
  /~/, // Home directory
  /\\0/, // Null byte (escaped for lint)
  /^\//, // Absolute path
  /\$\(/, // Command substitution
  /`/, // Backtick
] as const;

export function validateFilePath(filePath: string): { valid: boolean; reason?: string } {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(filePath)) {
      return { valid: false, reason: "Forbidden pattern detected" };
    }
  }

  const normalized = normalize(filePath);
  if (normalized.startsWith("..") || normalized.startsWith("/")) {
    return { valid: false, reason: "Path traversal attempt" };
  }

  return { valid: true };
}

// ============================================================
// CATEGORIZATION - Where does a changed file belong?
// ============================================================

export type Action = "sync" | "skip-immutable" | "skip-app" | "drift";

export function categorizeFile(
  filePath: string,
  additionalExclusions: string[],
): { action: Action } {
  // 1. Immutable exclusions first (security)
  if (micromatch.isMatch(filePath, IMMUTABLE_EXCLUSIONS as string[])) {
    return { action: "skip-immutable" };
  }

  // 2. App-specific skip patterns (incl. project-local exclusions)
  const allSkipPatterns = [...SKIP_PATTERNS, ...additionalExclusions];
  if (micromatch.isMatch(filePath, allSkipPatterns)) {
    return { action: "skip-app" };
  }

  // 3. Files that always merge (content shared by both repos)
  if (FORCE_MERGE_FILES.includes(filePath)) {
    return { action: "sync" };
  }

  // 4. Sync patterns, then owned test areas (tests for synced source;
  //    longest-prefix area wins so nested areas cannot be shadowed).
  if (micromatch.isMatch(filePath, SYNC_PATTERNS as string[])) {
    return { action: "sync" };
  }
  if (filePath.startsWith("tests/") && ownedTestPath(filePath)) {
    return { action: "sync" };
  }

  // 5. Changed in groot, matches no sync pattern → drift (new boilerplate
  //    surface the project may want to adopt manually).
  return { action: "drift" };
}
