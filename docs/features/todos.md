# Todos feature

The todo domain is the reference feature module: one table, a Zod schema, a
service on Drizzle, a Hono router, and two background jobs. To build a new
feature the same way, follow
[Adding a feature end to end](../guides/development.md#adding-a-feature-end-to-end).

## Module structure

```
apps/web/src/server/api/todo/
├── todo.routes.ts   # Hono router, mounted at /api/v1/todos
├── todo.service.ts  # Drizzle queries + Boom errors
├── todo.schema.ts   # Zod schemas
└── todo.jobs.ts     # todo-cleanup, todo-summary handlers
apps/web/src/server/db/schema.ts   # the `todos` table
```

## Table

```ts
// apps/web/src/server/db/schema.ts
export const todos = sqliteTable("todos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  ...timestamps, // createdAt, updatedAt as timestamp_ms; updatedAt is refreshed on every update
});
export type Todo = typeof todos.$inferSelect;
```

## API

Mounted under `/api/v1/todos`, JWT required.

| Method   | Path   | Body                     | Returns                               |
| -------- | ------ | ------------------------ | ------------------------------------- |
| `GET`    | `/`    |                          | `200` todos, newest first             |
| `POST`   | `/`    | `{ title, completed? }`  | `201` the todo                        |
| `GET`    | `/:id` |                          | `200` the todo, `404` if none         |
| `PUT`    | `/:id` | `{ title?, completed? }` | `200` the updated todo, `404` if none |
| `DELETE` | `/:id` |                          | `204`, `404` if none                  |

Validation errors come back as
`{ success: false, error: { code: "VALIDATION_ERROR", message, details: { title: ["Title is required"] } } }`
with status `400`; an id that is not a positive integer (`abc`, `0`) is also
`400`. curl examples are in [API requests](../reference/api-requests.md#todos-jwt).

## Implementation

```ts
// todo.schema.ts
export const createTodoSchema = z.object({
  title: z.string().min(1, "Title is required"),
  completed: z.boolean().optional().default(false),
});
export const updateTodoSchema = createTodoSchema.partial();
```

```ts
// todo.routes.ts
const router = new Hono<AppEnv>();

router.get("/", async (c) => ok(c, await todoService.findAll()));
router.post("/", async (c) => {
  const payload = await parseBody(c, createTodoSchema);
  return ok(c, await todoService.create({ data: payload }), 201);
});
router.get("/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  return ok(c, await todoService.findById({ id }));
});
router.put("/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  const payload = await parseBody(c, updateTodoSchema);
  return ok(c, await todoService.update({ id, data: payload }));
});
router.delete("/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  await todoService.deleteTodo({ id });
  return noContent(c);
});
```

```ts
// todo.service.ts
export async function findAll(): Promise<Todo[]> {
  return db.select().from(todos).orderBy(desc(todos.createdAt), desc(todos.id));
}

export async function findById({ id }: { id: number }): Promise<Todo> {
  const [todo] = await db.select().from(todos).where(eq(todos.id, id)).limit(1);
  if (!todo) throw Boom.notFound("Todo not found");
  return todo;
}

export async function create({ data }: { data: CreateTodoDTO }): Promise<Todo> {
  const [todo] = await db.insert(todos).values(data).returning();
  return todo!;
}
```

`update` and `deleteTodo` call `findById` first, so an unknown id is a `404`
rather than an empty result.

The router is mounted in `apps/web/src/server/app.ts` on the protected sub-app,
which already runs `jwtAuthMiddleware`: `api.route("/todos", todoRoutes)`.

## Background jobs

| Job            | Data                             | Does                                                                                                         |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `todo-cleanup` | `{ daysToKeep?: number }`        | Deletes completed todos whose `updatedAt` is older than `daysToKeep` (30); returns `{ deleted, daysToKeep }` |
| `todo-summary` | `{ includeCompleted?: boolean }` | Counts todos; returns `{ total, completed, pending }`. `includeCompleted` is only logged                     |

```ts
// todo.jobs.ts
export async function todoCleanupHandler(job: JobContext<TodoCleanupJobData>) {
  const daysToKeep = job.data?.daysToKeep ?? DEFAULT_DAYS_TO_KEEP;
  const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(todos)
    .where(and(eq(todos.completed, true), lt(todos.updatedAt, cutoff)))
    .returning({ id: todos.id });
  job.logger.info({ deleted: deleted.length, daysToKeep }, "Todo cleanup completed");
  return { deleted: deleted.length, daysToKeep };
}

export function registerTodoJobs(): void {
  registerJobHandler(TODO_JOB_NAMES.CLEANUP, todoCleanupHandler);
  registerJobHandler(TODO_JOB_NAMES.SUMMARY, todoSummaryHandler);
}
```

`registerTodoJobs()` is called from `registerJobHandlers()` in `app.ts`, which
`startWebApp()` runs before the first tick. Queue with
`addJob("todo-cleanup", { daysToKeep: 45 })` or `POST /api/v1/jobs`; see
[Background jobs](./jobs.md).

## Tests

- `tests/server/api/todos.test.ts` — the CRUD cycle and validation through `app.request()`
- `tests/server/app/todo.jobs.test.ts` — handlers via `addJob()` + `runTick()`

## Client

- `apps/web/src/client/pages/todo/` — the `Todos` page and its React Query hooks
  (`hooks/useTodos.ts`); each mutation invalidates the `["todos"]` query.
- The page is one entry in the `PAGES` list in `apps/web/src/client/App.tsx`,
  which gives it the `/todos` route and its navigation entries.
- Requests go through `apiClient` from `@groot/shell/lib/api`, which unwraps the
  `{ success, data }` envelope.
