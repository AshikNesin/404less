import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

/**
 * The Drizzle database handle. One SQLite dialect, two drivers:
 *
 * - Node: better-sqlite3 (`createSqliteDb()` in `./node`), sync driver
 * - Cloudflare Workers: D1 (`drizzle(env.DB)` from `drizzle-orm/d1`), async driver
 *
 * Both are awaited the same way, so application code is driver-agnostic as
 * long as it stays on the query builder (`db.select()`, `db.insert()`, ...)
 * and never relies on transactions, which D1 does not support.
 *
 * `db` is a live binding assigned by `bootstrap()` before the first request.
 */
// biome-ignore lint/suspicious/noExplicitAny: driver result types differ between sync and async drivers
export type Database = BaseSQLiteDatabase<"sync" | "async", any, Record<string, never>>;

export let db: Database;

export function setDb(instance: Database): void {
  db = instance;
}

export * from "./schema";
