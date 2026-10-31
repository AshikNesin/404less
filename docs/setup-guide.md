# Setup guide

Everything needed to run the API, job queue and React client locally and in
production, on Node or on Cloudflare Workers.

## Prerequisites

- **Node.js 24** (`engines` in `package.json`) and **pnpm**.
- **portless**, installed globally (`npm install -g portless`): `pnpm dev` runs
  through it to serve `https://groot.localhost`. `PORTLESS=0` bypasses the
  proxy, but the `portless` command must still exist. See
  [Portless & HTTPS](./guides/portless-https.md).
- Nothing for the database: SQLite ships inside `better-sqlite3`.
- For Cloudflare: a Cloudflare account; `wrangler` is a dev dependency.

## Zero-config development

```bash
pnpm install
pnpm dev
```

Every environment variable has a development default, so no `.env` is needed.
To override, copy `.env.example` to `.env` (git-ignored); `pnpm dev`,
`pnpm db:seed`, `pnpm db:migrate` and `entry.node.ts` load it with
`process.loadEnvFile` when present. Sign in with
`demo@example.com` / `demo@example.com`.

## Environment variables

Validated once at boot by `parseEnv()` in `packages/core/src/env.ts`; the same
schema runs on Node (`process.env`) and Workers (bindings). Empty strings count
as unset. In production (`NODE_ENV=production`) the variables marked
**required** must be set and the development fallbacks are refused.

| Variable                                                                                | Dev default                                     | Production                     | Notes                                                                                              |
| --------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                              | `development`                                   | `production`                   | `test` is set by the test setup                                                                    |
| `DATABASE_URL`                                                                          | `file:./data/dev.db`                            | `file:/data/prod.db` (default) | Node only; Workers bind D1. `:memory:` is accepted                                                 |
| `UPLOADS_DIR`                                                                           | `./local/uploads`                               | `/data/uploads` (default)      | Node only; uploads folder. Production default sits beside the database                             |
| `PORT`                                                                                  | `3000`                                          | injected by the host           | Node only                                                                                          |
| `JWT_SECRET_KEY`                                                                        | dev-only fallback                               | **required**, ≥ 32 characters  | HS256 signing key                                                                                  |
| `ADMIN_AUTH_KEY`                                                                        | dev-only fallback                               | **required**                   | Value of the `X-Admin-Auth-Key` header                                                             |
| `RP_NAME`                                                                               | `Groot`                                         | optional                       | Passkey display name                                                                               |
| `RP_ID`                                                                                 | `localhost`                                     | **required**, your domain      | Passkey relying party id; under portless see [Portless & HTTPS](./guides/portless-https.md)        |
| `ORIGIN`                                                                                | `http://localhost:3000`                         | **required**, `https://…`      | Passkey origin; must be a URL                                                                      |
| `CORS_ALLOWED_ORIGINS`                                                                  | empty (reflects the requesting origin)          | comma-separated list           | Only needed for cross-origin callers                                                               |
| `LOG_LEVEL`                                                                             | `debug` (dev) / `info` (prod) / `silent` (test) | optional                       | `trace` `debug` `info` `warn` `error` `fatal` `silent`                                             |
| `SENTRY_DSN`, `SENTRY_RELEASE`                                                          | unset                                           | optional                       | Error reporting through `config.sentry`; see [Sentry source maps](./guides/sentry-source-maps.md)  |
| `SENTRY_ORG`, `SENTRY_AUTH_TOKEN`, `SENTRY_PROJECT`, `SOURCE_COMMIT`                    | unset                                           | build-time only                | Source map upload and the release name; not part of `envSchema`                                    |
| `CLOUDFLARE_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_GATEWAY_ID`, `DEFAULT_MODEL` | unset                                           | optional                       | Read by app code that builds an `@groot/ai` client; see [AI inference](./features/ai-inference.md) |
| `PUSHOVER_USER_KEY`, `PUSHOVER_API_TOKEN`                                               | unset                                           | optional                       | Push notification when the Node server starts in production                                        |

Non-secret settings (rate limits, job tuning, ...) are derived from these in
`packages/core/src/config.ts` and overridden in `apps/web/src/server/config.ts`;
[Config](./reference/config.md#env-vs-config) covers that split and what adding
a variable involves. LLM provider keys such as `OPENAI_API_KEY` are not in the
schema: the provider SDKs behind `@groot/ai` read them from `process.env` when
no `apiKey` is passed.

Generate secrets with `openssl rand -base64 48 | tr -d '/+=' | cut -c1-48`.

## Local development

```bash
pnpm dev                 # https://groot.localhost (portless) — migrates + seeds first
PORTLESS=0 pnpm dev      # http://localhost:3000
pnpm dev:worker          # the Worker in workerd with a local D1 + R2 (http://localhost:8787)
```

`pnpm dev` runs `scripts/dev.ts`: seed (which applies migrations), then
`tsx watch apps/web/src/server/entry.node.ts`. In development the Node entry
runs Vite in middleware mode, so the client has HMR on the same port as the API.
`GET /health` confirms the API is up.

## Production build (Node)

```bash
pnpm build        # dist/client (Vite) + dist/server/bundle.js (esbuild) + dist/server/drizzle
pnpm start        # node dist/server/bundle.js with NODE_ENV=production
```

The bundle applies pending migrations on boot, serves `dist/client` with an
SPA fallback (hashed assets cached for a year), starts the job poller, and
shuts down gracefully on `SIGTERM` (flips `/health` to 503, waits for the
in-flight job tick). Workspace packages are inlined; npm dependencies and
`better-sqlite3` stay external and come from `pnpm install --prod` on the host.
See [Deploy on Node](./guides/deploy.md).

## Cloudflare Workers

Same app, different entry (`apps/web/src/server/entry.worker.ts`): D1 for the
database, R2 for uploads, Static Assets for the client, one cron trigger for
jobs. Secrets are Worker secrets, non-secret vars live in `wrangler.jsonc`.
Step by step in [Deploy on Cloudflare](./guides/deploy-cloudflare.md).

## Database

One engine, SQLite, through Drizzle. The schema is TypeScript
(`packages/core/src/database/schema.ts`, `packages/jobs/src/server/schema.ts`,
`apps/web/src/server/db/schema.ts`); migrations are generated SQL in
`apps/web/drizzle/`, applied automatically by the Node server at boot and by
the Worker on its first request. See [Database migrations](./guides/database-migrations.md).

## Background jobs

No broker: the `jobs` table is the queue. The Node entry starts a poller
(`startWorkers()`); on Workers the cron trigger runs one tick per minute.
Tuning lives in `config.jobs` ([Config](./reference/config.md)); the API and handler model
in [Background jobs](./features/jobs.md).

## Verify the stack

```bash
BASE=https://groot.localhost   # http://localhost:3000 under PORTLESS=0
curl $BASE/health
TOKEN=$(curl -s -X POST $BASE/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"demo@example.com"}' | jq -r .data.token)
curl -H "Authorization: Bearer $TOKEN" $BASE/api/v1/todos
curl -H "Authorization: Bearer $TOKEN" -X POST $BASE/api/v1/jobs \
  -H "Content-Type: application/json" -d '{"jobName":"todo-summary","data":{}}'
```

A `201` from the last call and a `completed` job a moment later on `/jobs` in
the UI confirm the API, database, job queue and JWT guard are all working.
