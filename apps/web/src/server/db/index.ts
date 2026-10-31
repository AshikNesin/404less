import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
import { db } from "@groot/core/database";

/**
 * App database access: groot's `db` (Drizzle query builder, D1 on Workers,
 * better-sqlite3 on Node) plus the two things the drivers do differently.
 */
export { db };
export * from "./schema";

/**
 * Run queries in one round trip: `db.batch()` on D1 (one implicit
 * transaction, like the old `DB.batch`). better-sqlite3 has no batch API;
 * there the queries run one after another (Node is the dev runtime).
 */
export async function batch<U extends BatchItem<"sqlite">, T extends Readonly<[U, ...U[]]>>(
  queries: T,
): Promise<BatchResponse<T>> {
  const handle = db as unknown as { batch?: (q: T) => Promise<BatchResponse<T>> };
  if (typeof handle.batch === "function") return handle.batch(queries);
  const results: unknown[] = [];
  for (const query of queries) results.push(await query);
  return results as BatchResponse<T>;
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
