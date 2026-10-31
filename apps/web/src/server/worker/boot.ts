import { drizzle } from "drizzle-orm/d1";
import { migrateD1 } from "@groot/core/database/d1";
import { logger } from "@groot/core/logger";
import { migrations } from "../../../drizzle";
import { startWebApp } from "../app";
import { instanceSecret } from "../lib/auth";
import type { Env } from "../types";

type WebApp = ReturnType<typeof startWebApp>;

let ready: Promise<WebApp> | undefined;

/**
 * Boot once per isolate: apply pending migrations, then bootstrap groot. Every
 * Workers handler (fetch, scheduled, queue) awaits this first, so groot's `db`
 * is wired whichever event wakes the isolate. Later calls reuse the app.
 *
 * `wrangler deploy` is the whole deploy: migrations run here on first use
 * (bookkeeping in `d1_migrations`, the table wrangler's own migrator used, so
 * databases created before groot pick up from 0008).
 */
export function bootWorker(bindings: Env, origin?: string): Promise<WebApp> {
  ready ??= (async () => {
    const applied = await migrateD1(bindings.DB as never, migrations);
    const app = startWebApp({
      env: await envSource(bindings, origin),
      db: drizzle(bindings.DB as never),
    });
    if (applied.length > 0) logger.info({ applied }, "Database migrations applied");
    return app;
  })().catch((error: unknown) => {
    ready = undefined; // let the next event retry instead of caching the failure
    throw error;
  });
  return ready;
}

/**
 * The env groot validates. With `NODE_ENV=production`, core refuses to boot
 * without JWT_SECRET_KEY, ADMIN_AUTH_KEY, ORIGIN and RP_ID. 404less uses none
 * of them (its own magic-link session, no core auth/admin routes), and its
 * selling point is a Deploy button with zero secrets to set, so when they are
 * unset they are filled in here: the two secrets generated once and kept in
 * app_meta (stable across isolates and deploys), ORIGIN/RP_ID from the
 * request that woke the isolate. Explicit vars/secrets always win.
 */
async function envSource(
  bindings: Env,
  origin?: string,
): Promise<Record<string, string | undefined>> {
  const source: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(bindings)) {
    if (typeof value === "string") source[key] = value;
  }
  if (source.NODE_ENV !== "production") return source;
  const db = drizzle(bindings.DB as never);
  source.JWT_SECRET_KEY ||= await instanceSecret("groot_jwt_secret_key", db);
  source.ADMIN_AUTH_KEY ||= await instanceSecret("groot_admin_auth_key", db);
  source.ORIGIN ||= origin ?? "http://localhost";
  source.RP_ID ||= new URL(source.ORIGIN).hostname;
  return source;
}
