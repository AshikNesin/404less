import type { D1Database } from "@cloudflare/workers-types";

/**
 * Apply Drizzle's generated SQL migrations to a D1 database from inside the
 * Worker, so a deploy needs no separate migration step. Bookkeeping uses
 * wrangler's `d1_migrations` table and file names, so
 * `wrangler d1 migrations apply` can still be used too.
 */
export interface SqlMigration {
  /** File name, e.g. `0000_init.sql`. */
  name: string;
  sql: string;
}

const TABLE = "d1_migrations";

/** drizzle-kit separates statements with `--> statement-breakpoint`. */
export function splitStatements(sql: string): string[] {
  return sql
    .split(/-->\s*statement-breakpoint/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function appliedNames(d1: D1Database): Promise<Set<string>> {
  const { results } = await d1.prepare(`SELECT name FROM ${TABLE}`).all<{ name: string }>();
  return new Set(results.map((row) => row.name));
}

/** Apply pending migrations in file-name order. Returns the names applied. */
export async function migrateD1(d1: D1Database, migrations: SqlMigration[]): Promise<string[]> {
  await d1
    .prepare(
      `CREATE TABLE IF NOT EXISTS ${TABLE} (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    )
    .run();

  let applied = await appliedNames(d1);
  const ran: string[] = [];

  for (const migration of [...migrations].sort((a, b) => a.name.localeCompare(b.name))) {
    if (applied.has(migration.name)) continue;
    const statements = splitStatements(migration.sql).map((statement) => d1.prepare(statement));
    statements.push(d1.prepare(`INSERT INTO ${TABLE} (name) VALUES (?)`).bind(migration.name));
    try {
      // One batch = one transaction: the schema change and its bookkeeping row land together.
      await d1.batch(statements);
      ran.push(migration.name);
    } catch (error) {
      // Another isolate may have applied it first; only that case is benign.
      applied = await appliedNames(d1);
      if (!applied.has(migration.name)) throw error;
    }
  }
  return ran;
}
