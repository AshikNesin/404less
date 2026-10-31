import { env, type Env } from "./env";
import type { LogLevel } from "./logger";

/**
 * Application configuration: typed defaults derived from `env`, overridden by
 * the app in `apps/web/src/server/config.ts` via `defineConfig()`.
 */

export interface RateLimitWindow {
  windowMs: number;
  max: number;
}

export interface AppConfig {
  app: { name: string; port: number };
  cors: { origins: string[] };
  auth: { jwtExpiresIn: string };
  jobs: {
    enabled: boolean;
    /** Node only: seconds between queue polls. Workers run one tick per cron fire. */
    pollIntervalSeconds: number;
    /** Max jobs claimed per tick. */
    batchSize: number;
    retryLimit: number;
    retryDelaySeconds: number;
    /** An `active` job older than this is treated as crashed and retried. */
    activeTimeoutSeconds: number;
    /** Completed and cancelled jobs (and their logs) are deleted after this. */
    keepCompletedDays: number;
    /** Run a tick right after `addJob()` instead of waiting for the next poll. */
    runInline: boolean;
  };
  logging: { level: LogLevel };
  passkey: { rpName: string; rpId: string; origin: string };
  rateLimits: { auth: RateLimitWindow; storage: RateLimitWindow; upload: RateLimitWindow };
  /** Error reporting. The entries start Sentry only when `dsn` is set. */
  sentry: { dsn: string; release?: string };
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export type ConfigOverrides = DeepPartial<AppConfig> | ((env: Env) => DeepPartial<AppConfig>);

export function defaultConfig(e: Env): AppConfig {
  const isTest = e.NODE_ENV === "test";
  const isProduction = e.NODE_ENV === "production";
  const fifteenMinutes = 15 * 60 * 1000;
  return {
    app: { name: "Groot", port: e.PORT },
    cors: {
      origins: e.CORS_ALLOWED_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    },
    auth: { jwtExpiresIn: "30d" },
    jobs: {
      enabled: !isTest,
      pollIntervalSeconds: 5,
      batchSize: 10,
      retryLimit: 3,
      retryDelaySeconds: 60,
      activeTimeoutSeconds: 300,
      keepCompletedDays: 7,
      runInline: true,
    },
    logging: { level: e.LOG_LEVEL ?? (isTest ? "silent" : isProduction ? "info" : "debug") },
    passkey: { rpName: e.RP_NAME, rpId: e.RP_ID, origin: e.ORIGIN },
    rateLimits: {
      auth: { windowMs: fifteenMinutes, max: 20 },
      storage: { windowMs: fifteenMinutes, max: 100 },
      upload: { windowMs: fifteenMinutes, max: 50 },
    },
    sentry: { dsn: e.SENTRY_DSN ?? "", release: e.SENTRY_RELEASE },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, overrides: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(overrides)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key], value) : value;
  }
  return out as T;
}

/** Identity helper that gives app config files type checking and completion. */
export function defineConfig(overrides: ConfigOverrides): ConfigOverrides {
  return overrides;
}

export function buildConfig(e: Env, overrides?: ConfigOverrides): AppConfig {
  const resolved = typeof overrides === "function" ? overrides(e) : overrides;
  return deepMerge(defaultConfig(e), resolved ?? {});
}

/** The active configuration. `bootstrap()` rebuilds it from the loaded env. */
export let config: AppConfig = buildConfig(env);

export function setConfig(overrides?: ConfigOverrides): AppConfig {
  config = buildConfig(env, overrides);
  return config;
}
