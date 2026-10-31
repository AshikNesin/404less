import { createMiddleware } from "hono/factory";
import { Boom, ErrorCode, type ErrorCodeValue } from "../errors";
import { config, type RateLimitWindow } from "../config";
import { clientIp } from "../utils/controller.utils";
import type { AppEnv } from "../types";

/**
 * Fixed-window rate limiting keyed by client IP.
 *
 * On Node the counters live in memory (one process, so that is exact). On
 * Workers memory is per isolate, so when a Cloudflare Rate Limiting binding
 * named `binding` exists on `c.env` it is used instead; without one the
 * in-memory fallback still applies per isolate.
 */
export interface RateLimitOptions {
  /** Read lazily so app config overrides apply. */
  window: () => RateLimitWindow;
  message: string;
  code?: ErrorCodeValue;
  /** Name of a Workers Rate Limiting binding to prefer when present. */
  binding?: string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export function rateLimit(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  let lastSweep = Date.now();

  const sweep = (now: number) => {
    if (now - lastSweep < 60_000) return;
    lastSweep = now;
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  };

  return createMiddleware<AppEnv>(async (c, next) => {
    const { windowMs, max } = options.window();
    const key = clientIp(c);
    const binding = options.binding
      ? (c.env?.[options.binding] as RateLimitBinding | undefined)
      : undefined;

    if (binding && typeof binding.limit === "function") {
      const { success } = await binding.limit({ key });
      if (!success) throw Boom.tooManyRequests(options.message, null, options.code);
      await next();
      return;
    }

    const now = Date.now();
    sweep(now);
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    c.header("RateLimit-Limit", String(max));
    c.header("RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    c.header("RateLimit-Reset", String(Math.ceil((bucket.resetAt - now) / 1000)));

    if (bucket.count > max) throw Boom.tooManyRequests(options.message, null, options.code);
    await next();
  });
}

export const authRateLimiter = rateLimit({
  window: () => config.rateLimits.auth,
  message: "Too many attempts",
  code: ErrorCode.RATE_LIMIT_EXCEEDED.code,
  binding: "AUTH_RATE_LIMITER",
});

export const storageRateLimiter = rateLimit({
  window: () => config.rateLimits.storage,
  message: "Too many storage operations from this IP, please try again later.",
  code: ErrorCode.RATE_LIMIT_EXCEEDED.code,
  binding: "STORAGE_RATE_LIMITER",
});

export const uploadRateLimiter = rateLimit({
  window: () => config.rateLimits.upload,
  message: "Too many file uploads from this IP, please try again later.",
  code: ErrorCode.UPLOAD_RATE_LIMIT_EXCEEDED.code,
  binding: "UPLOAD_RATE_LIMITER",
});
