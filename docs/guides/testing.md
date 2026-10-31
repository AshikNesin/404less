# Testing

Vitest (through Vite+) for server and client tests, Playwright for end to end.
Server tests never start an HTTP server: the Hono app is called in-process with
`app.request()` against an in-memory SQLite database.

## Commands

```bash
pnpm test           # server tests, single run
pnpm test:watch     # server tests, watch mode
pnpm test:client    # client tests (jsdom)
pnpm test:all       # both
pnpm test:e2e       # Playwright (starts the dev server itself)
```

## Server test setup

`tests/server/setup.ts` runs once per test file and boots the app through the
same `startWebApp()` as the entries, with:

- `NODE_ENV=test`, `DATABASE_URL=":memory:"`, `LOG_LEVEL=silent`
- `openDatabase(":memory:")`: a fresh database per file with every migration applied
- `memoryStorage()` for uploads
- `jobs.enabled = false` (a `NODE_ENV=test` default), so nothing runs in the
  background; tests call `runTick()` when they want jobs processed

Files are isolated from each other for free. Within a file, clear what you
need in `beforeEach` (e.g. `await db.delete(todos)`, `clearJobHandlers()`).

## Helpers (`tests/server/helpers.ts`)

| Helper                                             | Does                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `createTestApp()`                                  | `createWebApp()` — the real app with every router                                                                |
| `api(app, path, { method, json, token, headers })` | Sends the request, returns `{ status, headers, body }`; `body` is the envelope, a 204 yields `{ success: true }` |
| `signIn(app)`                                      | Creates a unique user and logs in; returns `{ token, user, email, password, cookie }`                            |
| `adminHeaders()`                                   | `{ "x-admin-auth-key": env.ADMIN_AUTH_KEY }`                                                                     |

## Layout

```
tests/
├── server/
│   ├── setup.ts · helpers.ts
│   ├── core/      # @groot/core units: env, config, logger, kv, storage adapters, D1 migrator, …
│   ├── jobs/      # @groot/jobs/server: queue + tick, schedules, housekeeping, routes, job logger
│   ├── api/       # HTTP tests through the routers: auth, passkey, settings, storage, todos
│   ├── app/       # app-owned: createApp, todo jobs (project-local, not synced)
│   ├── checks/    # repo guards: changesets gate, kit exports, typecheck coverage
│   ├── groot/     # sync tooling
│   ├── ai/        # @groot/ai
│   └── scripts/   # build scripts (runtime closure)
├── client/        # jsdom + testing-library (configured in vite.config.ts)
├── e2e/           # Playwright specs + global-setup.ts
└── kit-consumers/ # compiled fixture for pnpm typecheck:kit (never executed)
```

`tests/server/setup.ts`, `tests/server/{core,jobs,api,groot,ai}` and `tests/client`
sync with the source they exercise (`TEST_AREA_OWNERSHIP` in
`.groot/lib/patterns.ts`); `tests/server/app` and `tests/e2e` stay project-local.

## Patterns

### An API test

```ts
import { describe, expect, it } from "vite-plus/test";
import { api, createTestApp, signIn } from "../helpers";

const app = createTestApp();

describe("todos API", () => {
  it("creates, reads and deletes", async () => {
    const { token } = await signIn(app);
    const created = await api<{ id: number }>(app, "/api/v1/todos", {
      method: "POST",
      json: { title: "Write tests" },
      token,
    });
    expect(created.status).toBe(201);
    const id = created.body.data!.id;
    expect((await api(app, `/api/v1/todos/${id}`, { method: "DELETE", token })).status).toBe(204);
    expect((await api(app, `/api/v1/todos/${id}`, { token })).status).toBe(404);
  });

  it("rejects an invalid payload", async () => {
    const { token } = await signIn(app);
    const res = await api(app, "/api/v1/todos", { method: "POST", json: { title: "" }, token });
    expect(res.status).toBe(400);
    expect(res.body.error?.details).toMatchObject({ title: [expect.any(String)] });
  });
});
```

### A job test

```ts
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { eq } from "drizzle-orm";
import { db } from "@groot/core/database";
import { addJob, clearJobHandlers, jobs, registerJobHandler, runTick } from "@groot/jobs/server";

beforeEach(() => clearJobHandlers());

it("runs a job and stores its output", async () => {
  registerJobHandler<{ n: number }>("double", (job) => ({ doubled: job.data.n * 2 }));
  const id = await addJob("double", { n: 21 });
  expect(await runTick()).toMatchObject({ claimed: 1, completed: 1 });
  const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
  expect(row).toMatchObject({ state: "completed", output: { doubled: 42 } });
});
```

### An admin route

```ts
const res = await api(app, "/api/v1/auth/users", {
  method: "POST",
  headers: adminHeaders(),
  json: { email: "new@example.com", password: "a-long-password" },
});
expect(res.status).toBe(201);
```

### Services and units

Call them directly; the database is real, so there is nothing to mock
(`tests/server/core/kv.test.ts`, `tests/server/jobs/queue.test.ts`). Reach for
`vi.mock` only for external services.

## Coverage checklist per route

1. Success path with the right status (`200`, `201`, `204`) and body shape
2. Validation errors (`400` with `error.details`)
3. Auth guard (`401` without a token; `401`/`403` on admin routes)
4. Edge cases: missing resources (`404`), bad ids, pagination limits

## Client tests

Vitest + `@testing-library/react` in jsdom, aliases shared with the build:

```tsx
import { describe, expect, it } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import { Button } from "@groot/ui/button";

it("renders", () => {
  render(<Button>Click me</Button>);
  expect(screen.getByText("Click me")).toBeInTheDocument();
});
```

## End to end

`pnpm test:e2e` runs `tests/e2e/*.spec.ts` in Chromium, headed locally and
headless when `CI` is set (`playwright test -c playwright.headless.config.ts`
forces headless with a list reporter). Playwright starts the server itself on
`http://localhost:3000` against a throwaway database: it deletes
`data/e2e.db*`, seeds it with `scripts/seed.ts` and runs
`tsx watch apps/web/src/server/entry.node.ts` with
`DATABASE_URL=file:./data/e2e.db`; `tests/e2e/global-setup.ts` runs the same
`seed()`, so the demo user exists. Your `data/dev.db` is never touched.

Outside CI an already running server on port 3000 is reused (for example
`PORTLESS=0 pnpm dev`); the specs then run against that server's database.
CI does not run Playwright.

## Continuous integration

`.github/workflows/test.yml` runs, in order: typechecks (server, client,
typecheck coverage, kit fixture), the kit export guard, the changeset gate, the
checks-coverage guard, lint + format (`pnpm check`), the design-token check
(`pnpm check:tokens`), a migration freshness check (`pnpm db:generate` must
leave `apps/web/drizzle` unchanged), server and client tests, `pnpm build`,
the runtime dependency closure check, a wrangler dry run, and a pruned
production boot (tracked files plus `dist` copied to a fresh directory,
`pnpm install --prod`, `node dist/server/bundle.js`, `/health` answers,
`SIGTERM` exits within 15 s).
