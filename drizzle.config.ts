import { defineConfig } from "drizzle-kit";
import { defaultDatabaseUrl } from "@groot/core/env";

/**
 * drizzle-kit config. One SQLite schema; migrations are plain SQL files that
 * the Node entry applies at boot and `wrangler d1 migrations apply` applies on
 * Cloudflare.
 *
 *   pnpm db:generate   # after editing a schema file
 *   pnpm db:studio     # browse the local database
 */
const url = (process.env.DATABASE_URL || defaultDatabaseUrl(process.env.NODE_ENV)).replace(
  /^file:/,
  "",
);

export default defineConfig({
  dialect: "sqlite",
  schema: "./apps/web/src/server/db/schema.ts",
  out: "./apps/web/drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
