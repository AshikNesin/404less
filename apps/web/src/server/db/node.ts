import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSqliteDb } from "@groot/core/database/node";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The app's migrations: next to the bundle in production (`dist/server/drizzle`,
 * copied by scripts/build.mjs), `apps/web/drizzle` in the repo.
 */
function migrationsFolder(): string {
  const candidates = [path.resolve(here, "drizzle"), path.resolve(here, "../../../drizzle")];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`Drizzle migrations folder not found. Looked in: ${candidates.join(", ")}`);
  }
  return found;
}

/**
 * Open the Node SQLite database with every pending migration applied. The one
 * place the Node entry, the scripts and the test setup get a database from.
 */
export function openDatabase(url: string) {
  return createSqliteDb(url, { migrationsFolder: migrationsFolder() });
}
