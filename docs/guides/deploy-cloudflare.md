# Deploying on Cloudflare Workers

The same app, on the free plan: the Worker serves the API, D1 is the database,
an R2 bucket holds uploads, Static Assets serve the built client, and one cron
trigger runs the job tick. Everything is declared in `wrangler.jsonc`; the
entry is `apps/web/src/server/entry.worker.ts`.

## What maps to what

| Concern  | Node                                 | Workers                                                                                                            |
| -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Database | `better-sqlite3` file                | D1 binding `DB` (`drizzle(env.DB)`)                                                                                |
| Uploads  | `./local/uploads`                    | R2 binding `STORAGE` (`r2Storage(env.STORAGE)`)                                                                    |
| Client   | `dist/client` served by Hono         | Static Assets from `dist/client`, SPA fallback; `/api/*`, `/health`, `/ready`, `/__scheduled` hit the Worker first |
| Jobs     | poller every 5 s                     | cron `* * * * *` → `scheduled` → `runTick()`; `addJob()` also runs a tick through `ctx.waitUntil`                  |
| Env      | `.env` / platform vars               | `vars` in `wrangler.jsonc` + `wrangler secret put`                                                                 |
| Errors   | `@sentry/node`, from `config.sentry` | `@sentry/cloudflare` (`withSentry`), from `config.sentry`                                                          |
| Logs     | stdout                               | Workers Logs (`observability.enabled`)                                                                             |

## Step by step

1. **Log in**: `pnpm exec wrangler login`.
2. **Create the database**: `pnpm exec wrangler d1 create groot` and paste the
   returned id into `d1_databases[0].database_id` in `wrangler.jsonc`.
3. **Create the bucket**: `pnpm exec wrangler r2 bucket create groot-uploads`
   (or change `bucket_name`).
4. **Set the public domain**: in `wrangler.jsonc` → `vars`, set `RP_ID` to
   the hostname and `ORIGIN` to the `https://` origin the app will be served
   from (`<name>.<account>.workers.dev` or a custom domain), and `RP_NAME` if
   you like. `NODE_ENV` stays `production`. Rename `name` for a new project.
5. **Migrations** need no step: the Worker applies pending files from
   `apps/web/drizzle/` on its first request after each deploy (bookkeeping in
   wrangler's `d1_migrations` table, so `pnpm db:migrate:worker` still works
   if you prefer to migrate ahead of a deploy).
6. **Secrets**: `pnpm exec wrangler secret put JWT_SECRET_KEY` (≥ 32 chars) and
   `pnpm exec wrangler secret put ADMIN_AUTH_KEY`; optionally `SENTRY_DSN`.
   The Worker refuses to boot in production without them.
7. **Deploy**: `pnpm deploy:worker` (builds the client, then `wrangler deploy`).
8. **First user** — there is no seed script on Workers; use the admin API:

   ```bash
   curl -X POST https://groot.example.workers.dev/api/v1/auth/users \
     -H "Content-Type: application/json" \
     -H "X-Admin-Auth-Key: <ADMIN_AUTH_KEY>" \
     -d '{"email":"you@example.com","password":"a-long-password"}'
   ```

9. **Check**: `curl https://…/health`, then sign in. A later schema change is
   `pnpm db:generate`, commit, `pnpm deploy:worker`; the migration runs on the
   first request.

## Local development on workerd

```bash
pnpm dev:worker                                       # builds the client, runs wrangler dev on http://localhost:8787
                                                      # (local D1 is migrated on the first request)
pnpm check:worker                                     # dry-run bundle into tmp/worker-build (CI runs this)
```

`wrangler dev` uses `vars` from `wrangler.jsonc`, which set `NODE_ENV=production`,
so the production checks apply locally too. Copy `.dev.vars.example` to the
git-ignored `.dev.vars`: it supplies local secrets and points `RP_ID` and
`ORIGIN` at `localhost:8787`. Adding `NODE_ENV=development` to `.dev.vars`
instead lets the env fall back to the dev-only secrets.

The client is served from `dist/client` without HMR; rerun
`pnpm build:client` (or `pnpm dev:worker`) after client changes. To fire the
cron handler locally, run `pnpm exec wrangler dev --test-scheduled` and request
`/__scheduled`.

## Free-plan limits that shaped the design

| Resource      | Free plan (check Cloudflare's pricing page for current numbers) | What it means here                                                                                                                                    |
| ------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requests      | 100,000 / day; static assets do not count                       | Only `/api/*`, `/health`, `/ready` and cron fires are billed                                                                                          |
| CPU time      | 10 ms per request and per cron run                              | Passwords use PBKDF2 at 100,000 iterations (bcrypt would blow the budget); keep handlers and job batches small; waiting on D1/R2/fetch does not count |
| D1            | 5 GB, 5 M rows read / day, 100 k rows written / day             | App data, jobs, schedules, logs and the kv table all live here; the per-minute tick reads a few rows                                                  |
| R2            | 10 GB, 1 M class A + 10 M class B operations / month            | Uploads; downloads stream through the API (bindings have no signed URLs)                                                                              |
| Cron triggers | 5 per account                                                   | groot uses one (`* * * * *`)                                                                                                                          |
| Workers KV    | 1,000 writes / day                                              | Not used: the `kv` table lives in D1                                                                                                                  |

## Notes

- **Migrations run on the first request** of an isolate (`migrateD1()` in
  `@groot/core/database/d1`, fed by `apps/web/drizzle/index.ts`, which
  `pnpm db:generate` regenerates). Two isolates racing is safe: D1 applies each
  file in one batch and the second isolate sees it recorded. The Node entry
  applies the same files on boot through `openDatabase()` in
  `apps/web/src/server/db/node.ts`.
- **Rate limiting** is per isolate in memory. For exact limits add
  `ratelimits` bindings named `AUTH_RATE_LIMITER`, `STORAGE_RATE_LIMITER` and
  `UPLOAD_RATE_LIMITER` (`wrangler.jsonc` has a commented example for the
  first); the middleware uses each one when present.
- **Jobs run inside the request or the cron invocation** and share its CPU
  budget. Long work should be split into several jobs.
- **Workspace packages** resolve through the `exports` map in each
  package's `package.json`, so wrangler bundles the TypeScript sources directly.
- `wrangler.jsonc` and `apps/web/drizzle/**` are app-owned and never synced
  from the boilerplate.
