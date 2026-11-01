// 404less runtime bindings & shared types.
import type { D1Database, DurableObjectNamespace, Fetcher } from "@cloudflare/workers-types";

/**
 * What every route and service receives as `env` (Hono's `c.env`).
 *
 * On Workers this is the bindings object from wrangler.jsonc. On Node
 * (`pnpm dev`, tests) `entry.node.ts` supplies in-process stand-ins for the
 * Durable Objects (see `node-bindings.ts`).
 *
 * The database is NOT read from here: app code uses groot's `db` (Drizzle query
 * builder) via `db/index.ts`, which `bootstrap()` wires for either runtime. `DB`
 * stays on the type for the Durable Objects and the Worker boot, which build
 * their own Drizzle handle from the binding.
 */
export type Env = {
  DB: D1Database;
  DIGEST: DurableObjectNamespace;
  /** Max sites per team (default 5). */
  MAX_SITES_PER_TEAM?: string;
  /** Hours between scheduled crawls of a site (default 24, min 0.25). */
  CRAWL_INTERVAL_HOURS?: string;
  /** Days of raw 404 events to keep (default 90, max 365). */
  EVENT_RETENTION_DAYS?: string;
  /** RateLimiterDO binding (declared in wrangler.jsonc) */
  RATELIMIT: DurableObjectNamespace;
  /** Resend API key: sign-in links + email digests. Unset = dev mode (links returned in the API response). */
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  /** Static assets (dist/client): marketing site + SPA shell. Absent in unit tests and on Node. */
  ASSETS?: Fetcher;
};

/** Hono env for 404less routers: bindings + the signed-in user (set by the session middleware). */
export type AppBindings = { Bindings: Env; Variables: { userId: string } };
