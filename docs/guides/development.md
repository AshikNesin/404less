# Development workflow

Day-to-day commands, the conventions every module follows, and adding a
feature end to end.

## Commands

| Command                                                                       | What it does                                                                                                                |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                                                    | Migrate + seed SQLite, then Hono + Vite (HMR) on one port, under portless                                                   |
| `pnpm dev:worker`                                                             | Build the client, run the Worker in workerd with a local D1 and R2                                                          |
| `pnpm check` · `pnpm lint` · `pnpm format`                                    | Vite+ (Oxlint + Oxfmt)                                                                                                      |
| `pnpm typecheck` · `typecheck:client` · `typecheck:kit`                       | Server + client programs · client only · the kit consumer fixture                                                           |
| `pnpm test` · `pnpm test:watch`                                               | Server tests (Vitest, in-memory SQLite per file)                                                                            |
| `pnpm test:client` · `pnpm test:all` · `pnpm test:e2e`                        | Client tests (jsdom) · both suites · Playwright                                                                             |
| `pnpm build`                                                                  | `dist/client` (Vite) + `dist/server/bundle.js` (esbuild) + `dist/server/drizzle`                                            |
| `pnpm start`                                                                  | Run the production bundle                                                                                                   |
| `pnpm check:worker`                                                           | Dry-run the Workers bundle into `tmp/worker-build`                                                                          |
| `pnpm db:generate [--name x]`                                                 | drizzle-kit: schema diff → `apps/web/drizzle/NNNN_x.sql`, then refreshes `apps/web/drizzle/index.ts` for the Worker         |
| `pnpm db:migrate` · `pnpm db:migrate:worker`                                  | Apply migrations to the local SQLite file · to remote D1 ahead of a deploy (optional; the Worker migrates on first request) |
| `pnpm db:seed`                                                                | Demo user + three todos (idempotent; also applies migrations)                                                               |
| `pnpm db:studio`                                                              | Drizzle Studio on the local database                                                                                        |
| `pnpm check:tokens` · `check:closure` · `check:coverage` · `check:changesets` | Design tokens · bundle imports are declared deps · test-area ownership coverage · changeset gate                            |

## Conventions

| Convention           | Detail                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Validate first       | `await parseBody(c, schema)`, `parseQuery`, `parseId` — never read `c.req.json()` directly                                                                   |
| Return the envelope  | `ok(c, data, status?)` / `noContent(c)`; the client unwraps `data`                                                                                           |
| Throw Boom           | `Boom.notFound()`, `Boom.badRequest()`, …; never build error JSON by hand                                                                                    |
| Query builder only   | `db.select() / insert() / update() / delete()`; no transactions; raw `sql` only where Drizzle cannot express it                                              |
| Timestamps           | `integer({ mode: "timestamp_ms" })`; reuse `timestamps` from `@groot/core/database/schema`                                                                   |
| Logging              | `logger.info({ data }, "message")` from `@groot/core/logger`; no `console.log`                                                                               |
| Runtime-neutral core | Web APIs in `packages/core`; `node:` only in `database/node.ts`, `storage/node.ts`, `node:async_hooks`, `node:buffer`                                        |
| Config and env       | Tunables from `config.*`, secrets from the validated `env`, never `process.env`; adding one: [Configuration](../reference/config.md#env-vs-config)           |
| Imports              | `vite-plus/test` in tests; `@groot/core/<path>` to the module itself (`@groot/core/auth/auth.service`; feature folders have no barrel); `@groot/jobs/server` |
| Auth guard           | Mount under the protected sub-app in `createWebApp()`; `requireUser(c)` for the caller                                                                       |

## Adding a feature end to end

### 1. Table

```ts
// apps/web/src/server/db/schema.ts
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { timestamps } from "@groot/core/database/schema";

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  body: text("body"),
  ...timestamps,
});
export type Post = typeof posts.$inferSelect;
```

`pnpm db:generate --name add_posts`, review `apps/web/drizzle/0001_add_posts.sql`,
commit it with the regenerated `apps/web/drizzle/index.ts` and `meta/`. `pnpm dev`
applies it on the next start; see [Database migrations](./database-migrations.md).

### 2. Validation schema

```ts
// apps/web/src/server/api/post/post.schema.ts
import { z } from "zod";

export const createPostSchema = z.object({
  title: z.string().min(1, "Title is required"),
  body: z.string().optional(),
});
export const updatePostSchema = createPostSchema.partial();
export type CreatePostDTO = z.infer<typeof createPostSchema>;
export type UpdatePostDTO = z.infer<typeof updatePostSchema>;
```

### 3. Service

```ts
// apps/web/src/server/api/post/post.service.ts
import { desc, eq } from "drizzle-orm";
import { db } from "@groot/core/database";
import { Boom } from "@groot/core/errors";
import { posts, type Post } from "../../db/schema";
import type { CreatePostDTO, UpdatePostDTO } from "./post.schema";

export async function findAll(): Promise<Post[]> {
  return db.select().from(posts).orderBy(desc(posts.createdAt));
}

export async function findById(id: number): Promise<Post> {
  const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  if (!post) throw Boom.notFound("Post not found");
  return post;
}

export async function create(data: CreatePostDTO): Promise<Post> {
  const [post] = await db.insert(posts).values(data).returning();
  return post!;
}

export async function update(id: number, data: UpdatePostDTO): Promise<Post> {
  await findById(id);
  const [post] = await db.update(posts).set(data).where(eq(posts.id, id)).returning();
  return post!;
}

export async function remove(id: number): Promise<void> {
  await findById(id);
  await db.delete(posts).where(eq(posts.id, id));
}
```

### 4. Routes

```ts
// apps/web/src/server/api/post/post.routes.ts
import { Hono } from "hono";
import type { AppEnv } from "@groot/core/types";
import { ok, noContent } from "@groot/core/utils/api-response.utils";
import { parseBody, parseId } from "@groot/core/utils/controller.utils";
import * as service from "./post.service";
import { createPostSchema, updatePostSchema } from "./post.schema";

const router = new Hono<AppEnv>();

router.get("/", async (c) => ok(c, await service.findAll()));
router.post("/", async (c) =>
  ok(c, await service.create(await parseBody(c, createPostSchema)), 201),
);
router.get("/:id", async (c) => ok(c, await service.findById(parseId(c.req.param("id")))));
router.put("/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  return ok(c, await service.update(id, await parseBody(c, updatePostSchema)));
});
router.delete("/:id", async (c) => {
  await service.remove(parseId(c.req.param("id")));
  return noContent(c);
});

export default router;
```

Need the signed-in user? `const { userId } = requireUser(c);`.

### 5. Mount

```ts
// apps/web/src/server/app.ts
import postRoutes from "./api/post/post.routes";
// inside createWebApp() → routes(app):
api.route("/posts", postRoutes); // the `api` sub-app already runs jwtAuthMiddleware
```

### 6. Test

```ts
// tests/server/app/posts.test.ts
import { describe, expect, it } from "vite-plus/test";
import { api, createTestApp, signIn } from "../helpers";

const app = createTestApp();

describe("posts API", () => {
  it("creates and reads a post", async () => {
    const { token } = await signIn(app);
    const created = await api<{ id: number }>(app, "/api/v1/posts", {
      method: "POST",
      json: { title: "Hello" },
      token,
    });
    expect(created.status).toBe(201);
    const read = await api(app, `/api/v1/posts/${created.body.data!.id}`, { token });
    expect(read.body.data).toMatchObject({ title: "Hello" });
  });
});
```

Every test file gets its own in-memory database with migrations applied; see
[Testing](./testing.md).

## Adding a background job

```ts
// apps/web/src/server/api/post/post.jobs.ts
import { count } from "drizzle-orm";
import { db } from "@groot/core/database";
import { registerJobHandler, type JobContext } from "@groot/jobs/server";
import { posts } from "../../db/schema";

export async function postCountHandler(job: JobContext<{ label?: string }>) {
  const [{ total }] = await db.select({ total: count() }).from(posts);
  job.logger.info({ total, label: job.data?.label }, "Counted posts");
  return { total }; // JSON-serialisable → stored as the job's output
}

export function registerPostJobs(): void {
  registerJobHandler("post-count", postCountHandler);
}
```

Add `registerPostJobs()` to `registerJobHandlers()` in `apps/web/src/server/app.ts`; `startWebApp()` runs it.
Queue it with `await addJob("post-count", { label: "nightly" })`, through
`POST /api/v1/jobs`, or on a cron with `scheduleJob("post-count", {}, "0 3 * * *")`.
In tests jobs are disabled, so call `await runTick()` after `addJob()` and
assert on the row (`tests/server/app/todo.jobs.test.ts` is the model). The full
model is in [Background jobs](../features/jobs.md).

## Client tips

| Concern       | Where                                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routes        | `apps/web/src/client/App.tsx` (React Router)                                                                                                                                  |
| Data fetching | React Query hooks next to the page (e.g. `pages/todo/hooks`)                                                                                                                  |
| API calls     | `apiClient` from `@groot/shell/lib/api` (unwraps the envelope, sends the cookie)                                                                                              |
| Auth state    | `useAuthStore` from `@groot/shell/store/auth` (Zustand; the user, sign-in, sign-out)                                                                                          |
| UI components | `@groot/ui`; rules in [DLS](../features/dls.md), enforced by `pnpm check:tokens`                                                                                              |
| Page chrome   | `PageLayout` from `@groot/shell/components/layout/PageLayout` (there is no `…/layout` barrel; on a case-insensitive filesystem that path resolves to `components/Layout.tsx`) |

## Iteration loop

1. `pnpm dev` (server restarts on change via `tsx watch`; the client has HMR)
2. Change code
3. `pnpm test` (or `pnpm test:watch`) and `pnpm check`
4. Schema changed? `pnpm db:generate` and commit `apps/web/drizzle/`
5. Touched `packages/*/src`, `packages/*/package.json`, `apps/web/drizzle` or `.groot/`? `pnpm changeset`, or a no-release reason under `.changeset/no-release/` for internal changes
6. Update docs if behaviour changed
