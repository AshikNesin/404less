import { describe, expect, it } from "vite-plus/test";
import Database from "better-sqlite3";
import type { D1Database } from "@cloudflare/workers-types";
import { migrateD1, splitStatements } from "@groot/core/database/d1";

/** Just enough of the D1 API (prepare/bind/run/all/batch) over better-sqlite3 to drive migrateD1. */
function fakeD1(sqlite: InstanceType<typeof Database>): D1Database {
  const statement = (sql: string, params: unknown[] = []) => ({
    bind: (...values: unknown[]) => statement(sql, values),
    exec: () => sqlite.prepare(sql).run(...params),
    run: async () => {
      sqlite.prepare(sql).run(...params);
      return { success: true, results: [], meta: {} };
    },
    all: async () => ({ success: true, results: sqlite.prepare(sql).all(...params), meta: {} }),
  });
  return {
    prepare: (sql: string) => statement(sql),
    // Like D1, a batch is one transaction: any failure rolls back every statement.
    batch: async (statements: Array<{ exec: () => unknown }>) => {
      const tx = sqlite.transaction(() => statements.map((s) => s.exec()));
      return tx().map(() => ({ success: true, results: [], meta: {} }));
    },
  } as unknown as D1Database;
}

const first = {
  name: "0000_init.sql",
  sql: "CREATE TABLE `things` (`id` integer PRIMARY KEY);\n--> statement-breakpoint\nCREATE INDEX `things_idx` ON `things` (`id`);",
};
const second = { name: "0001_more.sql", sql: "ALTER TABLE `things` ADD `label` text;" };

describe("migrateD1", () => {
  it("splits drizzle statements", () => {
    expect(splitStatements(first.sql)).toHaveLength(2);
    expect(splitStatements("  ")).toEqual([]);
  });

  it("applies pending migrations once, in order, with wrangler-compatible bookkeeping", async () => {
    const sqlite = new Database(":memory:");
    const d1 = fakeD1(sqlite);

    expect(await migrateD1(d1, [second, first])).toEqual(["0000_init.sql", "0001_more.sql"]);
    expect(sqlite.prepare("SELECT name FROM d1_migrations ORDER BY id").all()).toEqual([
      { name: "0000_init.sql" },
      { name: "0001_more.sql" },
    ]);
    expect(
      sqlite
        .prepare("PRAGMA table_info(things)")
        .all()
        .map((c) => (c as { name: string }).name),
    ).toEqual(["id", "label"]);

    // Idempotent: nothing to do the second time.
    expect(await migrateD1(d1, [first, second])).toEqual([]);

    // A migration that fails leaves no bookkeeping row behind.
    const broken = { name: "0002_bad.sql", sql: "ALTER TABLE `nope` ADD `x` text;" };
    await expect(migrateD1(d1, [first, second, broken])).rejects.toThrow();
    expect(sqlite.prepare("SELECT count(*) AS n FROM d1_migrations").get()).toEqual({ n: 2 });
  });
});
