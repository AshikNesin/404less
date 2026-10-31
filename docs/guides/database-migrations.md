# Database migrations

One engine (SQLite), one ORM (Drizzle), one migration history. The schema is
TypeScript; migrations are generated SQL that every runtime applies the same
way.

## Where the schema lives

| File                                   | Tables                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/core/src/database/schema.ts` | `users`, `passkeys`, `kv` (+ the shared `timestamps` columns)                                            |
| `packages/jobs/src/server/schema.ts`   | `jobs`, `job_schedules`, `job_logs`                                                                      |
| `apps/web/src/server/db/schema.ts`     | App tables (`todos`); re-exports the two above and is the single drizzle-kit entry (`drizzle.config.ts`) |

Generated output: `apps/web/drizzle/NNNN_<name>.sql`, `meta/` (snapshot +
journal) and `index.ts`, the list of SQL files the Worker bundles (rewritten by
`pnpm db:generate`, never edited by hand). App-owned, never synced from the
boilerplate.

## Making a change

1. Edit a schema file.
2. `pnpm db:generate --name add_posts` (the name is optional).
3. Review the SQL. SQLite's `ALTER TABLE` is limited, so drizzle-kit may emit
   a create-copy-drop sequence for column changes; check it preserves data.
4. Apply locally: `pnpm dev` or `pnpm db:migrate`.
5. Commit the schema change and `apps/web/drizzle/` together, with a changeset
   (`apps/web/drizzle` is a managed surface).

CI runs `pnpm db:generate` and fails if it produces a diff, so a schema edit
without its migration never merges.

## How migrations are applied

| Where              | How                                                                                                                                                                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node, dev and prod | `openDatabase(url)` (`apps/web/src/server/db/node.ts`) opens the file and runs drizzle's migrator when the server boots. It is the one place that knows the folder: `dist/server/drizzle` next to the production bundle (copied by `scripts/build.mjs`), else `apps/web/drizzle` in the repo |
| Script             | `pnpm db:migrate` (`scripts/db-migrate.ts`); `pnpm db:seed` and `pnpm dev` also migrate first, all through `openDatabase()`                                                                                                                                                                  |
| Tests              | `tests/server/setup.ts` calls `openDatabase(":memory:")`, a fresh migrated database for every test file                                                                                                                                                                                      |
| Cloudflare D1      | The Worker applies pending files from `apps/web/drizzle/index.ts` on the first request of each isolate (`migrateD1()`); `pnpm db:migrate:worker` can run them ahead of time                                                                                                                  |

Every path reads the same SQL files and tracks what it applied in a
bookkeeping table: `__drizzle_migrations` on Node, `d1_migrations` on D1
(shared by `migrateD1()` and `wrangler d1 migrations apply`, so either can run).

## Rules

- Never hand-write a migration and never edit one that has been applied
  anywhere. Generate a new one.
- Timestamps are `integer({ mode: "timestamp_ms" })`, JSON columns are
  `text({ mode: "json" })`, booleans `integer({ mode: "boolean" })`: the same
  SQL runs on better-sqlite3 and D1.
- Keep migrations small and named for what they do.

## One engine, on purpose

SQLite everywhere: a file through better-sqlite3 on Node, D1 on Workers. There
is no Postgres path and nothing in application code branches on the engine
(see [ADR 0004](../adr/0004-hono-drizzle-sqlite-workers.md)). If Postgres is
ever needed it can come back as a `pgTable` twin of the schema with its own
drizzle config; until then one schema, one history.

## Troubleshooting

- **Reset the dev database**: delete `data/dev.db*` and run `pnpm dev`.
- **"Drizzle migrations folder not found"**: the error lists the paths
  `openDatabase()` tried, relative to its own file rather than the working
  directory. Next to the bundle that is `dist/server/drizzle`; deploy it with
  `dist/server/bundle.js` (`pnpm build` creates both).
- **CI "Schema changed without a migration"**: run `pnpm db:generate` and commit.
- **D1 state**: `pnpm exec wrangler d1 migrations list DB --remote`.
- **Look at the data**: `pnpm db:studio`.
