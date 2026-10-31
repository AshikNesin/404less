#!/usr/bin/env tsx
/**
 * Prepare the local SQLite database: opening it applies every pending
 * migration. Idempotent. 404less has no seeded account: signing in with any
 * email creates the user and a personal team (on localhost without
 * RESEND_API_KEY the sign-in link opens directly instead of being emailed).
 *
 * App-owned (excluded from groot sync): groot's seed creates a password user
 * and todos, neither of which exists here.
 */
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { startWebApp } from "../apps/web/src/server/app";
import { openDatabase } from "../apps/web/src/server/db/node";

/** Boot against `DATABASE_URL`, which applies migrations. */
export async function seed(): Promise<void> {
  startWebApp({
    env: { LOG_LEVEL: "warn", ...process.env },
    db: (env) => openDatabase(env.DATABASE_URL),
  });
  console.log("   ✅ Database migrated");
  console.log("   📧 Sign in at /app/login with any email (dev: no email is sent)");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (existsSync(".env")) process.loadEnvFile(".env");
  seed().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
