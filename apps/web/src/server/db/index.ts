import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
import { is } from "drizzle-orm";
import { SQLiteSelectBase } from "drizzle-orm/sqlite-core";
import { db } from "@groot/core/database";

/**
 * App database access: groot's `db` (Drizzle query builder, D1 on Workers,
 * better-sqlite3 on Node) plus the two things the drivers do differently.
 */
export { db };
export * from "./schema";

/**
 * Run queries as one unit: `db.batch()` on D1 (one round trip, one implicit
 * transaction). better-sqlite3 has no batch API, but it is synchronous on a
 * single connection, so there the queries run inside one SQLite transaction:
 * a failing statement rolls back the whole batch on both runtimes.
 */
export async function batch<U extends BatchItem<"sqlite">, T extends Readonly<[U, ...U[]]>>(
  queries: T,
): Promise<BatchResponse<T>> {
  const handle = db as unknown as {
    batch?: (q: T) => Promise<BatchResponse<T>>;
    $client?: { transaction?: <R>(fn: () => R) => () => R };
  };
  if (typeof handle.batch === "function") return handle.batch(queries);
  const transaction = handle.$client?.transaction;
  if (typeof transaction !== "function") throw new Error("batch(): unsupported database driver");
  const run = transaction.call(handle.$client, () =>
    queries.map((query) => {
      // sync driver: select → rows, insert/update/delete → run result (as D1's batch returns)
      const q = query as unknown as { all(): unknown; run(): unknown };
      return is(query, SQLiteSelectBase) ? q.all() : q.run();
    }),
  );
  return run() as BatchResponse<T>;
}

/** Rows changed by an insert/update/delete: D1 reports `meta.changes`, better-sqlite3 `changes`. */
export function changes(result: unknown): number {
  const r = result as { meta?: { changes?: number }; changes?: number } | undefined;
  return r?.meta?.changes ?? r?.changes ?? 0;
}

/** `batch()` for a list built at runtime (any length, results untyped). */
export async function batchAll(queries: BatchItem<"sqlite">[]): Promise<unknown[]> {
  if (queries.length === 0) return [];
  return batch(queries as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]) as Promise<unknown[]>;
}
