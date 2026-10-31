// Per-site ingest rate limiting: bounded memory (fixed-window counters in a DO),
// protects the free-tier D1 write budget (100k rows/day).
import { DurableObject } from "cloudflare:workers";
import type { Env } from "../types";

type RateState = { count: number; windowStart: number };

export class RateLimiterDO extends DurableObject<Env> {
  // counters live in storage under siteId keys; windows are 1 hour
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const [siteId] = url.pathname.split("/").filter(Boolean);
    if (!siteId) return new Response("missing site", { status: 400 });

    if (url.pathname.endsWith("/check")) {
      // POST /:siteId/check — increments; 204 if allowed, 429 if over limit
      const limit = 500; // events/site/hour — 12k/day worst case, well under budget
      const now = Date.now();
      const state = (await this.ctx.storage.get<RateState>(siteId)) ?? {
        count: 0,
        windowStart: now,
      };
      if (now - state.windowStart > 3_600_000) {
        state.count = 0;
        state.windowStart = now;
      }
      if (state.count >= limit) {
        return new Response(null, { status: 429, headers: { "x-ratelimit-limit": String(limit) } });
      }
      state.count++;
      await this.ctx.storage.put(siteId, state);
      return new Response(null, {
        status: 204,
        headers: {
          "x-ratelimit-limit": String(limit),
          "x-ratelimit-remaining": String(limit - state.count),
        },
      });
    }
    return new Response("not found", { status: 404 });
  }
}
