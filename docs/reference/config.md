# Configuration (`config.ts`)

Application settings are a typed object in code, not a file. `defaultConfig(env)`
in `packages/core/src/config.ts` derives sensible values from the validated
environment; the app overrides what it wants in `apps/web/src/server/config.ts`
with `defineConfig()`; `startWebApp()` passes those overrides to `bootstrap()`,
which merges the two before the first request.

```ts
import { config } from "@groot/core/config";

config.app.name; // "Groot"
config.jobs.pollIntervalSeconds; // 5
```

## Overriding

```ts
// apps/web/src/server/config.ts
import { defineConfig } from "@groot/core/config";

export const appConfig = defineConfig({
  app: { name: "Groot" },
  jobs: { batchSize: 25 },
});

// Or branch on the validated env:
export const appConfig = defineConfig((env) => ({
  rateLimits: { auth: { windowMs: 60_000, max: env.NODE_ENV === "production" ? 10 : 1000 } },
}));
```

Overrides deep-merge over the defaults (objects merge, arrays and scalars
replace, `undefined` is ignored). `defineConfig` is an identity helper that
gives you type checking and completion for `DeepPartial<AppConfig>`.

## Settings

| Path                        | Default                                             | Source                                   |
| --------------------------- | --------------------------------------------------- | ---------------------------------------- |
| `app.name`                  | `"Groot"`                                           | app override                             |
| `app.port`                  | `3000`                                              | `PORT`                                   |
| `cors.origins`              | `[]` (reflect the requesting origin)                | `CORS_ALLOWED_ORIGINS` (comma-separated) |
| `auth.jwtExpiresIn`         | `"30d"`                                             |                                          |
| `jobs.enabled`              | `true` (`false` when `NODE_ENV=test`)               |                                          |
| `jobs.pollIntervalSeconds`  | `5` — Node poller interval                          |                                          |
| `jobs.batchSize`            | `10` — max jobs claimed per tick                    |                                          |
| `jobs.retryLimit`           | `3`                                                 |                                          |
| `jobs.retryDelaySeconds`    | `60` — base delay, doubles per attempt (max 24 h)   |                                          |
| `jobs.activeTimeoutSeconds` | `300` — an `active` job older than this is retried  |                                          |
| `jobs.keepCompletedDays`    | `7` — completed/cancelled jobs + logs deleted after |                                          |
| `jobs.runInline`            | `true` — `addJob()` and retry run a tick right away |                                          |
| `logging.level`             | `debug` dev / `info` prod / `silent` test           | `LOG_LEVEL`                              |
| `passkey.rpName`            | `"Groot"`                                           | `RP_NAME`                                |
| `passkey.rpId`              | `"localhost"`                                       | `RP_ID`                                  |
| `passkey.origin`            | `"http://localhost:3000"`                           | `ORIGIN`                                 |
| `rateLimits.auth`           | 20 requests / 15 min per IP                         |                                          |
| `rateLimits.storage`        | 100 requests / 15 min per IP                        |                                          |
| `rateLimits.upload`         | 50 requests / 15 min per IP                         |                                          |
| `sentry.dsn`                | `""` — both entries start Sentry only when set      | `SENTRY_DSN`                             |
| `sentry.release`            | unset                                               | `SENTRY_RELEASE`                         |

## Env vs config

- **`env`** (`packages/core/src/env.ts`) holds secrets and runtime facts:
  what differs between deployments and has no sensible default in code
  (`JWT_SECRET_KEY`, `ADMIN_AUTH_KEY`, `DATABASE_URL`, `SENTRY_DSN`, ...). It is
  validated once by `parseEnv()` at boot, and every key in `envSchema` is read
  through the validated `env` or surfaced through `defaultConfig()`, never from
  `process.env`. See [Setup guide](../setup-guide.md#environment-variables).
- **`config`** holds tunables with defaults: what the app does with those
  facts. `defaultConfig(env)` sets them, `defineConfig()` overrides them, and
  feature code reads `config.*`.
- Adding a variable means adding it to `envSchema` and `.env.example`, plus a
  field in `AppConfig` and `defaultConfig()` when it tunes behaviour. A new
  tunable with no deployment input goes into `AppConfig` + `defaultConfig()`
  only.

Both are live bindings replaced by `bootstrap()`, so read them inside functions,
not at module top level (module-level reads see the development defaults).

## Boot order

```
startWebApp({ env, db, storage, reportError })   apps/web/src/server/app.ts
  bootstrap({ ...runtime, config: appConfig })
    loadEnv(source)          parse + validate, dev defaults outside production
    setConfig(overrides)     defaultConfig(env) ⊕ defineConfig(...)
    configureLogger()        level from config.logging.level, pretty outside production
    setDb(...)               the Drizzle handle (better-sqlite3 or D1)
    setStorageAdapter(...)   StorageAdapter (local, R2 or memory), if given
    setErrorReporter(...)    Sentry or anything else, if given
  registerJobHandlers()
  createWebApp()           the Hono app
```

Called once per process on Node (`entry.node.ts`, `scripts/seed.ts`), once per
isolate on Workers (`entry.worker.ts`), and once per test file
(`tests/server/setup.ts`).
