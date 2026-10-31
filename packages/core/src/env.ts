import { z } from "zod";

/**
 * Environment variables, validated once at boot.
 *
 * The same schema runs on Node (`process.env`, with `.env` loaded by the Node
 * entry) and on Cloudflare Workers (the `env` bindings object). Outside
 * production, unset secrets fall back to development defaults so a fresh
 * checkout boots with zero configuration. Production refuses the defaults.
 *
 * Only secrets and deployment facts belong here, and every key is read
 * through the validated `env` (or surfaced through `defaultConfig()`), never
 * from `process.env`. Tunables with defaults belong in `AppConfig`.
 * Build-time variables (`SOURCE_COMMIT`, `SENTRY_AUTH_TOKEN`, ...) are read
 * by the build scripts and are not part of this schema.
 */

export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal", "silent"] as const;

/** Development-only fallbacks. `parseEnv` rejects them in production. */
export const DEV_DEFAULTS = {
  JWT_SECRET_KEY: "dev-only-jwt-secret-change-me-before-you-ship-0000",
  ADMIN_AUTH_KEY: "dev-only-admin-key",
} as const;

/**
 * Where the Node runtime keeps SQLite when `DATABASE_URL` is unset: `data/dev.db`
 * in the checkout during development, `/data/prod.db` in production, so a host
 * only has to mount a persistent volume at `/data`.
 */
export function defaultDatabaseUrl(nodeEnv?: string): string {
  return nodeEnv === "production" ? "file:/data/prod.db" : "file:./data/dev.db";
}

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** SQLite file for the Node runtime. Ignored on Workers, which bind D1. Default: `defaultDatabaseUrl()`. */
  DATABASE_URL: z.string().optional(),
  /** Node only: where uploads live. Default: `./local/uploads` in development, `uploads/` next to the SQLite file in production (`/data/uploads`). */
  UPLOADS_DIR: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  JWT_SECRET_KEY: z.string().min(32, "must be at least 32 characters").optional(),
  ADMIN_AUTH_KEY: z.string().min(1).optional(),
  /** Passkey relying party. Must match the public domain in production. */
  RP_NAME: z.string().default("Groot"),
  RP_ID: z.string().default("localhost"),
  ORIGIN: z.url().default("http://localhost:3000"),
  /** Comma-separated list. Empty allows the requesting origin. */
  CORS_ALLOWED_ORIGINS: z.string().default(""),
  LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
  /** Error reporting; surfaced as `config.sentry`, which both entries read. */
  SENTRY_DSN: z.string().optional(),
  /** Must match the release source maps were uploaded under. The Node bundle bakes in its build's release as the default. */
  SENTRY_RELEASE: z.string().optional(),
  /**
   * Cloudflare AI Gateway and the default model, for app code that builds an
   * `@groot/ai` client (`new AI({ ..., apiKey: env.CLOUDFLARE_API_KEY })`).
   * `@groot/ai` does not read these; given no `apiKey`, its provider SDKs
   * fall back to their own variables (`OPENAI_API_KEY`, ...) in `process.env`.
   */
  CLOUDFLARE_API_KEY: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_GATEWAY_ID: z.string().optional(),
  DEFAULT_MODEL: z.string().optional(),
  /** Pushover push notifications (`@groot/core/notification`); both unset turns them off. */
  PUSHOVER_USER_KEY: z.string().optional(),
  PUSHOVER_API_TOKEN: z.string().optional(),
});

type ParsedEnv = z.infer<typeof envSchema>;

export type Env = Omit<ParsedEnv, "DATABASE_URL" | "JWT_SECRET_KEY" | "ADMIN_AUTH_KEY"> & {
  DATABASE_URL: string;
  JWT_SECRET_KEY: string;
  ADMIN_AUTH_KEY: string;
};

export type EnvSource = Record<string, string | undefined>;

/** Parse and validate an environment source. Throws with every problem listed. */
export function parseEnv(source: EnvSource): Env {
  // Hosting platforms often set unused variables to "". Treat empty as unset.
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string" && value !== "") cleaned[key] = value;
  }

  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n${issues.join("\n")}`);
  }

  const parsed = result.data;
  const isProduction = parsed.NODE_ENV === "production";
  const missing: string[] = [];

  const secret = (key: keyof typeof DEV_DEFAULTS): string => {
    const value = parsed[key];
    if (value) return value;
    if (isProduction) {
      missing.push(key);
      return "";
    }
    return DEV_DEFAULTS[key];
  };

  const env: Env = {
    ...parsed,
    DATABASE_URL: parsed.DATABASE_URL ?? defaultDatabaseUrl(parsed.NODE_ENV),
    JWT_SECRET_KEY: secret("JWT_SECRET_KEY"),
    ADMIN_AUTH_KEY: secret("ADMIN_AUTH_KEY"),
  };

  if (isProduction) {
    if (!cleaned.ORIGIN) missing.push("ORIGIN");
    if (!cleaned.RP_ID) missing.push("RP_ID");
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables in production: ${missing.join(", ")}`,
      );
    }
  }

  return env;
}

/**
 * The active environment. Starts as development defaults so modules can be
 * imported in any order; `bootstrap()` replaces it with the real values before
 * the first request. Read `env.X` inside functions, not at module top level.
 */
export let env: Env = parseEnv({});

export function loadEnv(source: EnvSource): Env {
  env = parseEnv(source);
  return env;
}
