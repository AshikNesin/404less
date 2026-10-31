# Deploying on Node (Railpack: Coolify, Railway)

The Node build is one process: `node dist/server/bundle.js` serves the API and
the built client, applies migrations on boot and runs the job poller. SQLite
lives in a file, so the host needs a persistent disk and exactly one replica.
For a disk-less, free deploy use [Cloudflare Workers](./deploy-cloudflare.md).

## What Railpack detects

| Signal          | Source                                                 |
| --------------- | ------------------------------------------------------ |
| Runtime         | `package.json` → `engines.node` (24.x)                 |
| Package manager | `package.json` → `packageManager` (pnpm 10)            |
| Install         | `pnpm install --frozen-lockfile`                       |
| Build           | `package.json` → `scripts.build`                       |
| Start           | `railpack.json` → `deploy.startCommand` (`pnpm start`) |

`pnpm build` runs Vite (client → `dist/client`) and esbuild (server →
`dist/server/bundle.js`, workspace packages inlined, npm dependencies
external) and copies `apps/web/drizzle` to `dist/server/drizzle`, where
`openDatabase()` (`apps/web/src/server/db/node.ts`) finds it next to the
bundle. `pnpm start` boots the bundle with `NODE_ENV=production`; there is no
`prestart` step, the server migrates itself before it listens.
`better-sqlite3` is the only native runtime dependency and is installed on the
host by `pnpm install`. CI checks this layout by booting the bundle from a
`pnpm install --prod` copy and waiting for `/health`.

## Coolify

1. **+ New Resource → Application**, pick the repo, **Build Pack → Railpack**.
2. **Persistent Storage**: a volume mounted at `/data`. Production stores the
   database at `/data/prod.db` and uploads at `/data/uploads` by default, so
   no `DATABASE_URL` is needed. Without the volume the data is lost on
   every redeploy. Mount it outside the app directory (Railpack builds into
   `/app`): a path like `/app/data` depends on the build's working directory
   and hides the repo's own `data/` folder. Set **Container naming** to a
   consistent name (no rolling updates): two processes must never share the
   SQLite file.
3. **Environment variables** (below).
4. **Deploy.** Point the healthcheck at `/health` (returns 503 while shutting
   down) or `/ready`.

## Production environment

Set these on the host; defaults and the full list are in the
[setup guide](../setup-guide.md#environment-variables).

- **Required**: `JWT_SECRET_KEY` (≥ 32 random characters), `ADMIN_AUTH_KEY`
  (the `X-Admin-Auth-Key` header for user management), `RP_ID` and `ORIGIN`
  (`app.example.com`, `https://app.example.com`; passkeys depend on them).
- **Not needed**: `NODE_ENV` (`pnpm start` sets it), `DATABASE_URL` and
  `UPLOADS_DIR` (they default to the `/data` volume). Do not set `PORT`; the
  platform injects it.
- **Optional**: `RP_NAME`, `CORS_ALLOWED_ORIGINS` (only when another origin
  calls the API), `SENTRY_DSN` and `SENTRY_RELEASE` (see
  [Sentry source maps](./sentry-source-maps.md); the SDK costs ~50 MB of
  RSS — see [Memory](#memory)).

The server refuses to start in production with the development fallbacks or
with any of the required variables missing, and lists what is wrong.

## First user

`pnpm db:seed` is for local development. In production create the first user
through the admin API:

```bash
curl -X POST https://app.example.com/api/v1/auth/users \
  -H "Content-Type: application/json" \
  -H "X-Admin-Auth-Key: $ADMIN_AUTH_KEY" \
  -d '{"email":"you@example.com","password":"a-long-password","name":"You"}'
```

## Memory

`@sentry/node` is imported only when `SENTRY_DSN` is set, so an instance
without error reporting never loads the SDK. Measured on the production
bundle (`node dist/server/bundle.js`, Node 24, macOS, SQLite on a local
disk; averages over several runs, RSS of the node process, idle → after
2,000 light requests at high concurrency):

| Configuration    | RSS idle | RSS after load |
| ---------------- | -------- | -------------- |
| No `SENTRY_DSN`  | ~183 MB  | ~248 MB        |
| `SENTRY_DSN` set | ~234 MB  | ~298 MB        |

Treat these as ballpark: RSS varies with platform (Linux reports less than
macOS for the same workload), Node version and allocator behaviour (±5% run
to run here).

### Small instances

Node sizes its default heap from the memory it sees on the host, not from a
container limit, so cap it explicitly on hosts with a small memory quota
(`pnpm start` passes `NODE_OPTIONS` through to `node`):

```bash
NODE_OPTIONS="--max-old-space-size=160 --max-semi-space-size=16"
```

- `--max-old-space-size` caps the JS heap and forces earlier GC. Leave
  headroom for memory outside the heap (native addons, buffers, the job
  poller) — on a 256 MB instance, 160 is a reasonable starting point.
- `--max-semi-space-size` shrinks the young generation for further savings,
  trading more frequent minor GCs.

### Why not pointer-compressed Node

[V8 pointer compression](https://v8.dev/blog/pointer-compression) would cut
heap usage further, but it needs a custom Node build
([`platformatic/node-caged`](https://hub.docker.com/r/platformatic/node-caged))
on which `better-sqlite3` segfaults — its native binding assumes stock
Node's heap layout. Supporting it would mean a different SQLite driver and
Node 26; revisit if either changes.

## Notes

- **Uploads** go to `/data/uploads` in production (beside the database) and to
  `./local/uploads` otherwise. Set `UPLOADS_DIR` to move them.
- **Graceful shutdown**: on `SIGTERM` the server flips `/health` to 503, waits
  two seconds for the load balancer, stops the job poller (waiting for the
  in-flight tick), closes the listener and exits.
- **Scaling**: one replica. The poller, the SQLite file and in-memory rate
  limits all assume a single process. Need more? That is what the Workers
  target is for.
- **Cron jobs**: schedules live in the database (`POST /api/v1/jobs/schedule`)
  and survive redeploys.
- **Heroku-style buildpacks** that set `NPM_CONFIG_LOGLEVEL=error` hide pnpm
  lifecycle output; set it to `notice` to see why a build step failed.
