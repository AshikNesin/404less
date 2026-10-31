# Architecture

How the server is put together and the conventions every feature module
follows. The same Hono app runs on Node and on Cloudflare Workers; only the
entry file differs.

## Layout

```
packages/core/src/                 # Boilerplate (synced)
├── app.ts                         # createApp(): middleware, /health, /ready, error envelope
├── bootstrap.ts                   # env → config → logger → db → storage → error reporter
├── env.ts · config.ts             # Zod env schema · typed AppConfig + defineConfig()
├── context.ts                     # AsyncLocalStorage request context, waitUntil()
├── types.ts                       # AppEnv (Hono generics), AuthUser
├── database/                      # db handle (index.ts), core tables (schema.ts), Node driver (node.ts), D1 migrator (d1.ts)
├── auth/ passkey/ settings/       # Reusable feature modules (routes + service + schema); import the module, there is no barrel
├── storage/                       # StorageAdapter contract, local/R2/memory adapters, routes
├── kv/ logger/ errors/            # kv table store · structured logger + breadcrumbs · HttpError, Boom, toHttpError, reporting seam
├── notification/                  # startup notification the Node entry sends in production
├── middlewares/                   # request logger, JWT, admin key, rate limit, error handler
└── utils/                         # ok()/noContent(), parseBody()/parseQuery()/parseId(), jwt, password

packages/jobs/src/server/          # queue, tick, worker, dashboard API — see features/jobs.md

apps/web/src/server/               # App-owned (not synced)
├── app.ts                         # startWebApp(): bootstrap + register job handlers + createWebApp()
├── config.ts                      # defineConfig() overrides
├── entry.node.ts · entry.worker.ts
├── db/schema.ts                   # app tables; drizzle-kit entry (re-exports core + jobs tables)
├── db/node.ts                     # openDatabase(url): SQLite with migrations applied (Node entry, scripts, tests)
└── api/<feature>/                 # feature.routes.ts, .service.ts, .schema.ts, .jobs.ts
```

## Request flow

```
HTTP request
  → requestLoggerMiddleware   request id (x-request-id), child logger, AsyncLocalStorage context, one log line
  → cors                      config.cors.origins (empty = reflect the requesting origin)
  → bodyLimit                 1 MB on /api/* except /api/v1/storage/* (storage sets its own 100 MB limit)
  → router                    new Hono<AppEnv>() mounted by createWebApp() in apps/web/src/server/app.ts
  → handler                   await parseBody(c, schema) → service → ok(c, data, status?)
  → service                   Drizzle query builder → SQLite
  → errorHandler              toHttpError(thrown) → { success: false, error: { code, message, details } }
```

`/api/v1/auth` and `/api/v1/passkey` are mounted directly (their login routes
are public and rate-limited); every other router is mounted on a sub-app that
runs `jwtAuthMiddleware` first. An unknown route gets the same envelope with a
404 `NOT_FOUND`.

## Writing a feature module

A feature is one folder, `apps/web/src/server/api/<feature>/`: a Zod schema,
a service that calls Drizzle directly (there is no model layer), a plain Hono
router whose handlers parse, call the service and return the envelope, and
optionally job handlers. [Development workflow](./development.md#adding-a-feature-end-to-end)
builds one end to end; [Todos](../features/todos.md) is the reference module.
Handlers use these helpers:

| Helper (`@groot/core/utils/…`)                    | Does                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `parseBody(c, schema)` (async)                    | JSON body through Zod; bad JSON or validation → 400 with field details |
| `parseQuery(c, schema)`, `parseParams(c, schema)` | Query string / route params through Zod                                |
| `await parseForm(c, schema)`                      | Multipart / urlencoded body through Zod (repeated fields are arrays)   |
| `parseId(value)`, `parseStringParam(value)`       | Positive integer id / required string param, else 400                  |
| `requireUser(c)`                                  | The JWT user (`{ userId, email }`), else 401                           |
| `clientIp(c)`                                     | `cf-connecting-ip`, `x-forwarded-for`, `x-real-ip`, or `unknown`       |
| `ok(c, data, status = 200)`                       | `{ success: true, data }`                                              |
| `noContent(c)`                                    | 204                                                                    |
| `fail(c, error, status)`                          | `{ success: false, error }` (used by the error handler)                |

Errors come from `@groot/core/errors`. Throw a `Boom.*` factory for expected
failures (`badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, …).
Each takes `(message?, data?, code?)`: `data` becomes `error.details` and
`code` is any string (`Boom.notFound("Job not found", null, "JOB_NOT_FOUND")`);
`Boom.boomify(err, { statusCode })` covers any other status. The error handler
normalises whatever was thrown with `toHttpError()`: an `HttpError` passes
through, SQLite constraint failures are mapped (`UNIQUE` → 409, `FOREIGN KEY` /
`NOT NULL` / `CHECK` → 400), and Hono's `HTTPException` keeps its status. A
4xx logs a warning. A 5xx or anything unrecognised logs an error with the
request's breadcrumbs and goes to `reportError()`; an unrecognised error
returns a 500 whose message is only shown in development.

## Database

Drizzle on SQLite, nothing else. `db` from `@groot/core/database` is a live
binding set by `bootstrap()`: better-sqlite3 (sync driver) on Node, D1 (async
driver) on Workers. Code that `await`s the query builder works on both. Rules:
query builder only, no `db.transaction()` (D1 has none), timestamps as
`integer({ mode: "timestamp_ms" })`, JSON as `text({ mode: "json" })`. Tables
live in three schema files; `apps/web/src/server/db/schema.ts` re-exports them
all and is the drizzle-kit entry. See [Database migrations](./database-migrations.md).

## Bootstrap and the two runtimes

`bootstrap({ env, config, db, storage, reportError })` wires, in order, env →
config → logger → db → storage → error reporter (see
[boot order](../reference/config.md#boot-order)). Nothing calls it directly:
both entries, `scripts/seed.ts` and the test setup go through
`startWebApp(runtime)` in `apps/web/src/server/app.ts`, which adds the app
config, registers the job handlers and builds the app. A runtime supplies only
its env source and adapters:

|          | `entry.node.ts`                                                                                                                                       | `entry.worker.ts`                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| env      | `process.env` (+ `.env` via `process.loadEnvFile` when present)                                                                                       | Worker vars + secrets bindings                                           |
| db       | `openDatabase(DATABASE_URL)` (`db/node.ts`), migrates on boot                                                                                         | `drizzle(env.DB)` (D1); `migrateD1()` on the first request of an isolate |
| storage  | `localStorage(uploadsRoot(env))`: `UPLOADS_DIR`, else `uploads/` next to the SQLite file in production (`/data/uploads`), `./local/uploads` otherwise | `r2Storage(env.STORAGE)` when the bucket is bound                        |
| errors   | `@sentry/node` when `config.sentry.dsn` is set                                                                                                        | `@sentry/cloudflare` `withSentry`, same config                           |
| client   | Vite middleware (dev) / `dist/client` + SPA fallback (prod)                                                                                           | Static Assets; `run_worker_first` for `/api/*`, `/health`, `/ready`      |
| jobs     | `startWorkers()` poller when `config.jobs.enabled`                                                                                                    | `scheduled` handler → `runTick()`                                        |
| shutdown | `SIGTERM` / `SIGINT` → `/health` 503 → stop workers → close                                                                                           | n/a                                                                      |

Core stays runtime-neutral: Web APIs only (`crypto.subtle`, `fetch`,
`TextEncoder`), with `node:` imports confined to `database/node.ts`,
`storage/node.ts`, `node:async_hooks` and `node:buffer` (both provided by
Workers under `nodejs_compat`).

## Storage

`storage` from `@groot/core/storage` is whatever `StorageAdapter` the entry
injected: `put / get / head / delete / list / copy` over `/`-separated keys,
folders as common prefixes. Three adapters ship (local filesystem, R2 bucket
binding, memory for tests); another backend is one file implementing the
interface in `packages/core/src/storage/adapter.ts`. See [File storage](../features/storage.md).

## Background jobs

The `jobs` table is the queue. `addJob()` inserts a row; `runTick()` claims and
runs due rows; the Node poller or the Workers cron trigger calls it. Handlers
are registered by `startWebApp()`: add a feature's registration to
`registerJobHandlers()` in `apps/web/src/server/app.ts`. Details in [Background jobs](../features/jobs.md).

## Logging and request context

`logger` from `@groot/core/logger` is a small structured logger:
`logger.info({ userId }, "Signed in")`, `logger.child({ component })`, levels
`trace` … `fatal`. Output is a readable line outside production and JSON lines
in production (`configureLogger` is called by `bootstrap`). Before a record is
written, fields named like secrets (`password`, `secret`, `authorization`, …)
become `[REDACTED]` and every string goes through the app's scrubber, if one
is set with `setScrubber()`. A child can carry a record sink
(`logger.child(bindings, { sink })`, inherited by its children) that receives
every record whatever the console level; the jobs package persists job logs
this way.

The request context (id, start time, breadcrumbs, `waitUntil`) lives in AsyncLocalStorage:
`addBreadcrumb("auth", "token verified")` records a step that is attached to
the next error log; `waitUntil(promise)` keeps a Workers request alive for
background work and simply detaches on Node. `reportError(error, context)` is
the seam the entries point at Sentry.

## Key-value store

`kv` from `@groot/core/kv` is a JSON key-value API over the `kv` table with
optional TTL; app settings and passkey challenges use it. See [KV](../features/kv.md).

## Authentication

| Layer     | Routes                                                                         | Requirement                                                                           |
| --------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Public    | `POST /api/v1/auth/login`, `POST /api/v1/passkey/login/*`, `/health`, `/ready` | none (login routes: 20 requests / 15 min per IP)                                      |
| Protected | everything else under `/api/v1`                                                | JWT in the `token` httpOnly cookie or `Authorization: Bearer …` (`jwtAuthMiddleware`) |
| Admin     | `POST` / `GET /api/v1/auth/users`                                              | `X-Admin-Auth-Key` equal to `ADMIN_AUTH_KEY` (`adminAuthMiddleware`)                  |

Passwords are PBKDF2-SHA256 (100,000 iterations through WebCrypto); tokens are
HS256 via jose, valid for `config.auth.jwtExpiresIn` (30 days). Login sets the
cookie and also returns the token for non-browser clients.

## Client

React Router 7 (`apps/web/src/client/App.tsx`), the session store
(`@groot/shell/store/auth`, Zustand: the user, sign-in and sign-out; the JWT
stays in the HttpOnly cookie), React Query over a `fetch` client
(`@groot/shell/lib/api`: `/api/v1` prefix, sends the cookie, unwraps `data`,
throws `ApiError`), `@groot/ui` primitives. See [Client](../features/client.md).

## Design principles

| Principle                 | What it means                                                           |
| ------------------------- | ----------------------------------------------------------------------- |
| One app, two entries      | Runtime-specific code lives only in `entry.node.ts` / `entry.worker.ts` |
| Feature isolation         | A feature is one folder: schema, service, routes, jobs                  |
| Parse at the edge         | Zod on every body, query and param; services receive typed data         |
| One envelope              | `ok()` / `noContent()` / thrown `Boom` — never hand-built JSON          |
| The database is the queue | Jobs, schedules, logs, kv are tables, not services                      |
| Boring persistence        | Query builder, no transactions, generated migrations                    |
