# Key-value store

A JSON key-value API over the `kv` table (`packages/core/src/kv/index.ts`). It
runs wherever the database runs (better-sqlite3 on Node, D1 on Workers) and
needs no extra service. The boilerplate uses it for app settings
(`APP_SETTING:` namespace) and passkey challenges (`passkey:challenge:`
namespace, five-minute TTL, consumed on first use).

## API

```ts
import { kv, createNamespaceKv, purgeExpiredKv } from "@groot/core/kv";

await kv.set("feature:flags", { beta: true });
await kv.set("otp:123", "482913", 5 * 60 * 1000); // third argument: ttlMs (0 or omitted: no expiry)
const flags = await kv.get<{ beta: boolean }>("feature:flags");
await kv.has("otp:123");
await kv.delete("otp:123"); // → true when a row was removed
await kv.list("feature:"); // → [{ key, value }]
await kv.clear("feature:"); // → number of rows deleted

const cache = createNamespaceKv("cache"); // keys stored as "cache:<key>", returned without the prefix
await cache.set("users", [...], 60_000);
```

| Method                    | Behaviour                                                               |
| ------------------------- | ----------------------------------------------------------------------- |
| `get(key)`                | `undefined` when missing or expired (an expired row is deleted on read) |
| `set(key, value, ttlMs?)` | Upsert; the value is `JSON.stringify`-ed                                |
| `has(key)`                | `get(key) !== undefined`                                                |
| `delete(key)`             | `true` when a row existed                                               |
| `list(prefix?)`           | Live entries whose key starts with `prefix` (`_`/`%` are escaped)       |
| `clear(prefix?)`          | Delete every key with the prefix, expired or not; returns the count     |

A namespaced store applies its prefix to every method, so `cache.clear()` only
removes `cache:` keys. On the root `kv`, `clear()` with no prefix empties the
whole table, app settings and passkey challenges included.

## Expiry

`expiresAt` is enforced on read and swept by `purgeExpiredKv()` (through the
`kv_expires_at_idx` index), which the job tick's
[housekeeping](./jobs.md#the-tick-packagesjobssrcservertickts) runs at most
every ten minutes (Node poller or Workers cron). Housekeeping keeps its own
last-run time in the `jobs:housekeeping:lastRunAt` key, so a root
`kv.clear()` only makes the next sweep run early. On Node with
`config.jobs.enabled` off there is no poller, so expired rows stay in the table
until read; they are never returned either way.

## Schema

```ts
// packages/core/src/database/schema.ts
export const kv = sqliteTable(
  "kv",
  {
    key: text("key").primaryKey(),
    value: text("value").notNull(), // JSON
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("kv_expires_at_idx").on(table.expiresAt)],
);
```

## When to use it

Settings, short-lived tokens and challenges, small caches. Use a real table for
relational data, and avoid high-frequency counters on the Workers free plan:
every `set` is a D1 row write, and writes are the scarcest
[free-plan quota](../guides/deploy-cloudflare.md#free-plan-limits-that-shaped-the-design).
This is a table in your SQLite/D1 database, not Workers KV.
