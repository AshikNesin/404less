# ADR 0004: Hono + Drizzle on SQLite, deployable to Node and Cloudflare Workers

- Status: **accepted**
- Date: 2026-10-25

## Context

groot exists to ship small apps fast and self-host them cheaply. The previous
stack (Express 5, Prisma with twin SQLite/Postgres schemas and migration
histories, pg-boss or honker behind a queue adapter, Keyv, pino, varlock,
`config.yml`, files-sdk) worked, but every piece cost more than it returned:
two schema files kept in parity by a test, a generated database client that
embedded the engine and had to be regenerated on every switch, an adapter
layer over two job brokers (one with a native binding that needed an apt
package on the deploy image), a YAML config loader with its own templating, an
env loader binary, and a Node-only runtime.

Meanwhile the Cloudflare free plan — Workers, D1, R2, Static Assets, cron
triggers — had become a serious zero-cost hosting target, and none of those
libraries could run on it.

## Decision

- **HTTP: Hono.** Web-standard request/response, runs unchanged on Node
  (`@hono/node-server`) and Workers, small. Handlers return an explicit
  envelope (`ok()`, `noContent()`); parsing helpers wrap Zod.
- **Database: Drizzle, SQLite only.** The schema is TypeScript; migrations are
  generated SQL (`pnpm db:generate`) applied by drizzle's migrator at boot on
  Node and by the Worker itself on its first request on Cloudflare. better-sqlite3 on
  Node, D1 on Workers, the same SQL files for both. Postgres is not supported
  for now.
- **Jobs: the `jobs` table is the queue.** One `runTick()` pass claims due
  rows with a single `UPDATE … RETURNING`, runs them, retries with backoff,
  and does housekeeping. A Node poller or a Workers cron trigger calls it;
  `addJob()` triggers an inline tick.
- **KV: a `kv` table**, not Keyv and not Workers KV.
- **Config and env: code.** A Zod env schema with development defaults
  (`env.ts`) and a typed `AppConfig` with `defineConfig()` overrides
  (`config.ts`). No YAML, no loader.
- **Storage: a six-method `StorageAdapter` contract** with local-filesystem,
  R2-binding and in-memory implementations. No SDK; other backends are one
  file.
- **Crypto on Web APIs:** PBKDF2-SHA256 through WebCrypto for passwords, jose
  for JWTs, so auth is identical on both runtimes.
- **Runtime seams:** `bootstrap()` injects env, db, storage and the error
  reporter; `entry.node.ts` and `entry.worker.ts` are the only
  runtime-specific files, and `packages/core` stays runtime-neutral.

## Consequences

- One engine, one schema, one migration history, one migration command.
- Core uses Web APIs only; `node:` imports are confined to the Node driver and
  storage adapter (plus `node:async_hooks` and `node:buffer`, which Workers
  provide under `nodejs_compat`).
- **No explicit `db.transaction()`**, because D1 does not expose one. D1's
  `batch([...])` does run its statements atomically; otherwise multi-step
  writes are designed as single statements, compare-and-set updates or
  idempotent retries; the job tick is the model.
- **The Workers free plan's 10 ms CPU budget** per request and per cron run
  shapes the defaults: PBKDF2 at 100,000 iterations instead of bcrypt, one
  cron fire per minute, small job batches, no CPU-heavy work in handlers.
- SQLite means one writer: the Node deploy is a single replica on a persistent
  volume. Horizontal scale is what the Workers target is for.
- R2 bindings have no signed URLs, so downloads stream through the API.
- Less to install, generate and explain: no client generation, no broker, no
  pooler guidance, no apt packages, no env loader binary.
- Postgres can return as a `pgTable` twin schema with its own drizzle config;
  nothing in application code branches on the engine today.

## Alternatives considered

- **Keep Express under `nodejs_compat`.** Express can be made to run on Workers
  behind an adapter, but the app would still carry Express-era middleware
  (multer, cors, compression) built on Node streams, and nothing else in the
  stack — Prisma's engine, pg-boss, honker's native binding, pino transports —
  would follow it there. Switching to a Web-standard framework removed the
  shim and the whole chain behind it.
- **Cloudflare Containers.** Would run the Node image as-is, but containers are
  not on the free plan and keep the SQLite-file-on-one-host problem.
- **Keep Prisma.** A D1 driver adapter exists, but it keeps the generated
  client, the two schema files and the engine-specific regenerate step;
  Drizzle's schema-in-TypeScript removed all three and its migrator runs in
  both runtimes.
- **Kysely.** A fine query builder, but it has no schema definition and no
  migration generator, so it would have needed a second tool for what
  drizzle-kit does.
