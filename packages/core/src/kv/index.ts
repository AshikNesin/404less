import { eq, lt, and, isNotNull, sql } from "drizzle-orm";
import { db, kv as kvTable } from "../database";

/**
 * Key-value storage on the `kv` table. Values are JSON; `ttlMs` sets an
 * expiry that is enforced on read and swept by the job tick.
 */
export interface KvStore {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  /** Every live entry whose key starts with `prefix` (keys returned without the namespace). */
  list<T = unknown>(prefix?: string): Promise<Array<{ key: string; value: T }>>;
  /** Delete every entry whose key starts with `prefix`. Returns the count. */
  clear(prefix?: string): Promise<number>;
}

/**
 * Keys starting with `prefix`, case-sensitively. Not `LIKE`: SQLite's LIKE
 * ignores ASCII case, so `clear("user:")` would also delete `User:1`.
 */
function keyStartsWith(prefix: string) {
  return sql`substr(${kvTable.key}, 1, length(${prefix})) = ${prefix}`;
}

export function createKvStore(namespace = ""): KvStore {
  const full = (key: string) => `${namespace}${key}`;

  return {
    async get<T>(key: string): Promise<T | undefined> {
      const [row] = await db
        .select()
        .from(kvTable)
        .where(eq(kvTable.key, full(key)))
        .limit(1);
      if (!row) return undefined;
      if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
        await db.delete(kvTable).where(eq(kvTable.key, full(key)));
        return undefined;
      }
      return JSON.parse(row.value) as T;
    },

    async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
      const expiresAt = ttlMs ? new Date(Date.now() + ttlMs) : null;
      const encoded = JSON.stringify(value);
      await db
        .insert(kvTable)
        .values({ key: full(key), value: encoded, expiresAt })
        .onConflictDoUpdate({ target: kvTable.key, set: { value: encoded, expiresAt } });
    },

    async has(key: string): Promise<boolean> {
      return (await this.get(key)) !== undefined;
    },

    async delete(key: string): Promise<boolean> {
      const deleted = await db
        .delete(kvTable)
        .where(eq(kvTable.key, full(key)))
        .returning();
      return deleted.length > 0;
    },

    async list<T>(prefix = ""): Promise<Array<{ key: string; value: T }>> {
      const rows = await db
        .select()
        .from(kvTable)
        .where(keyStartsWith(full(prefix)));
      const now = Date.now();
      return rows
        .filter((row) => !row.expiresAt || row.expiresAt.getTime() > now)
        .map((row) => ({
          key: row.key.slice(namespace.length),
          value: JSON.parse(row.value) as T,
        }));
    },

    async clear(prefix = ""): Promise<number> {
      const deleted = await db
        .delete(kvTable)
        .where(keyStartsWith(full(prefix)))
        .returning();
      return deleted.length;
    },
  };
}

/** Default (un-namespaced) store. */
export const kv: KvStore = createKvStore();

/** A store whose keys are prefixed with `namespace:`. */
export const createNamespaceKv = (namespace: string): KvStore => createKvStore(`${namespace}:`);

/** Delete expired entries. Called from the job tick's housekeeping. */
export async function purgeExpiredKv(): Promise<number> {
  const deleted = await db
    .delete(kvTable)
    .where(and(isNotNull(kvTable.expiresAt), lt(kvTable.expiresAt, new Date())))
    .returning();
  return deleted.length;
}
