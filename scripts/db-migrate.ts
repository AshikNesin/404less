#!/usr/bin/env tsx
/**
 * Apply pending Drizzle migrations to the local SQLite database.
 * The Node server also does this on boot; this script is for CI, scripts and
 * one-off runs. For Cloudflare D1 use `pnpm db:migrate:worker`.
 */
import { existsSync } from "node:fs";
import { parseEnv } from "@groot/core/env";
import { openDatabase } from "../apps/web/src/server/db/node";

if (existsSync(".env")) process.loadEnvFile(".env");
const url = parseEnv(process.env).DATABASE_URL;
openDatabase(url);
console.log(`✓ Migrations applied to ${url}`);
