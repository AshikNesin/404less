import type {
  ExecutionContext,
  ExportedHandler,
  Request as WorkerRequest,
  Response as WorkerResponse,
} from "@cloudflare/workers-types";
import type { Env } from "./types";
import { bootWorker } from "./worker/boot";
import { scheduled } from "./worker/cron";

/**
 * Cloudflare Workers entry: 404less's production runtime: D1, two Durable
 * Objects, the marketing site + SPA from Static Assets, and two cron triggers
 * (the crawl tick every minute, nightly retention). Bindings live in
 * wrangler.jsonc. Pending migrations apply on the first event of an isolate.
 */

// Durable Object classes must be top-level named exports (wrangler finds them by name).
export { DigestDO } from "./do/digest";
export { RateLimiterDO } from "./do/rate-limiter";

export default {
  async fetch(request: WorkerRequest, bindings: Env, ctx: ExecutionContext) {
    const app = await bootWorker(bindings, new URL(request.url).origin);
    // Hono speaks the standard fetch types; the Workers runtime types are a superset.
    const response = await app.fetch(request as unknown as Request, bindings, ctx);
    return response as unknown as WorkerResponse;
  },
  scheduled,
} satisfies ExportedHandler<Env>;
