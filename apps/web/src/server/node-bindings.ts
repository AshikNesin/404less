import { logger } from "@groot/core/logger";
import type { Env } from "./types";

/**
 * In-process stand-ins for the Workers bindings, so the whole app runs on Node
 * (`pnpm dev`) without wrangler. Behaviour mirrors the Workers pieces closely
 * enough for development; production is Cloudflare (`pnpm dev:worker` runs the
 * real runtime locally).
 *
 * - RATELIMIT: the RateLimiterDO's fixed window (500 events/site/hour), in memory.
 * - DIGEST: logs the event instead of buffering and alerting.
 */
export function createNodeBindings(vars: Record<string, string | undefined> = process.env): Env {
  const env = {
    ...stringVars(vars),
    RATELIMIT: namespace(rateLimiter()),
    DIGEST: namespace(async (_name, request) => {
      logger.debug({ event: await request.text() }, "digest event (Node: alerts are not sent)");
      return Response.json({ ok: true });
    }),
  } as unknown as Env;
  return env;
}

/** String vars only, with "" treated as unset (as core's parseEnv does and Workers never sends). */
function stringVars(vars: Record<string, string | undefined>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    if (typeof value === "string" && value !== "") out[key] = value;
  }
  return out;
}

type Handler = (name: string, request: Request) => Promise<Response>;

/** A Durable Object namespace: `get(idFromName(name)).fetch(...)` reaches `handler(name, …)`. */
function namespace(handler: Handler) {
  return {
    idFromName: (name: string) => name,
    get: (name: string) => ({
      fetch: (input: string | Request, init?: RequestInit) =>
        handler(name, new Request(input, init)),
    }),
  };
}

/** Same limits as do/rate-limiter.ts. `?limit=` overrides the default 500, capped at 500. */
function rateLimiter(): Handler {
  const windows = new Map<string, { count: number; windowStart: number }>();
  return async (name, request) => {
    const url = new URL(request.url);
    const key = url.pathname.split("/").filter(Boolean)[0] || name;
    const requested = url.searchParams.get("limit");
    const parsed = requested == null ? 500 : Math.floor(Number(requested));
    const limit =
      requested == null || !Number.isFinite(parsed) ? 500 : Math.min(500, Math.max(1, parsed));
    const now = Date.now();
    const state = windows.get(key) ?? { count: 0, windowStart: now };
    if (now - state.windowStart > 3_600_000) {
      state.count = 0;
      state.windowStart = now;
    }
    if (state.count >= limit) return new Response(null, { status: 429 });
    state.count++;
    windows.set(key, state);
    return new Response(null, { status: 204 });
  };
}
