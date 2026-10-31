import { sqliteTable, integer, text, blob, index } from "drizzle-orm/sqlite-core";

/**
 * Core tables. Timestamps are stored as integer milliseconds (`timestamp_ms`)
 * so the same schema runs on better-sqlite3, D1 and Durable Object SQLite.
 * App-owned tables live in `apps/web/src/server/db/schema.ts`.
 */

export const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
};

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  /** PBKDF2 hash, see `utils/password.utils.ts`. */
  password: text("password").notNull(),
  name: text("name"),
  ...timestamps,
});

export const passkeys = sqliteTable(
  "passkeys",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credentialId: text("credential_id").notNull().unique(),
    publicKey: blob("public_key", { mode: "buffer" }).notNull(),
    counter: integer("counter").notNull().default(0),
    deviceType: text("device_type"),
    backedUp: integer("backed_up", { mode: "boolean" }).notNull().default(false),
    transports: text("transports", { mode: "json" }).$type<string[]>().notNull().default([]),
    credentialName: text("credential_name"),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [index("passkeys_user_id_idx").on(table.userId)],
);

/** Generic key-value storage (settings, passkey challenges, caches). */
export const kv = sqliteTable(
  "kv",
  {
    key: text("key").primaryKey(),
    /** JSON-encoded value. */
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("kv_expires_at_idx").on(table.expiresAt)],
);

export type User = typeof users.$inferSelect;
export type Passkey = typeof passkeys.$inferSelect;
