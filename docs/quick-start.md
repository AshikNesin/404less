# Quick start

Get the app running, sign in, and add your first feature.

## What's in the box

| Area  | Capabilities                                                                           |
| ----- | -------------------------------------------------------------------------------------- |
| Auth  | JWT login (httpOnly cookie or bearer), passkeys/WebAuthn, admin user management        |
| API   | Hono routers, Zod-validated parsing helpers, `{ success, data }` envelope, Boom errors |
| Jobs  | Table-backed queue with retries, cron schedules, logs and a dashboard                  |
| Data  | Drizzle ORM on SQLite (better-sqlite3 on Node, D1 on Workers), `kv` table              |
| Files | Storage adapter: local disk on Node, R2 bucket on Workers                              |
| AI    | Unified LLM API with Zod structured output (`@groot/ai`)                               |
| Infra | JSON logger with request context, Sentry seam, rate limiting, health probes            |
| UI    | Radix + Tailwind component kit, layout shell, API client                               |

## 1. Install and run

```bash
pnpm install
pnpm dev
```

`pnpm dev` creates `data/dev.db`, applies migrations, seeds a demo user and
three todos, then starts the Node server with Vite in middleware mode (HMR on
the same port). Nothing to configure: every environment variable has a
development default. Copy `.env.example` to `.env` only when you want to
override something.

The app is served at **`https://groot.localhost`** via portless, which must be
installed globally (`https://groot.localhost:8888` when no portless proxy is
already running; first run asks to trust a local certificate, see
[Portless & HTTPS](./guides/portless-https.md)). Bypass its proxy with
`PORTLESS=0 pnpm dev` → `http://localhost:3000`.

Optional: `pnpm groot:setup` renames the app (package name, `app.name`,
Worker name, `RP_NAME`) and offers to install portless.

## 2. Sign in

Email `demo@example.com`, password `demo@example.com` (from `scripts/seed.ts`).

To create another user, call the admin endpoint with the development admin key:

```bash
# http://localhost:3000 under PORTLESS=0
curl -X POST https://groot.localhost/api/v1/auth/users \
  -H "Content-Type: application/json" \
  -H "X-Admin-Auth-Key: dev-only-admin-key" \
  -d '{"email":"you@example.com","password":"a-long-password"}'
```

More recipes in [API requests](./reference/api-requests.md).

## 3. Add a feature

A feature is a folder under `apps/web/src/server/api/<feature>/` with a Zod
schema, a service and a Hono router, plus a table in the app schema.

1. **Table** in `apps/web/src/server/db/schema.ts`:

   ```ts
   export const posts = sqliteTable("posts", {
     id: integer("id").primaryKey({ autoIncrement: true }),
     title: text("title").notNull(),
     ...timestamps,
   });
   ```

   Then `pnpm db:generate` and commit the new file in `apps/web/drizzle/`.

2. **Routes** in `post.routes.ts`:

   ```ts
   import { Hono } from "hono";
   import type { AppEnv } from "@groot/core/types";
   import { ok } from "@groot/core/utils/api-response.utils";
   import { parseBody, parseId } from "@groot/core/utils/controller.utils";
   import * as service from "./post.service";
   import { createPostSchema } from "./post.schema";

   const router = new Hono<AppEnv>();
   router.get("/", async (c) => ok(c, await service.findAll()));
   router.post("/", async (c) =>
     ok(c, await service.create(await parseBody(c, createPostSchema)), 201),
   );
   router.get("/:id", async (c) => ok(c, await service.findById(parseId(c.req.param("id")))));
   export default router;
   ```

3. **Mount** it in `apps/web/src/server/app.ts` next to the other protected routers:
   `api.route("/posts", postRoutes);`

The service and schema files, tests and background jobs are covered in
[Development workflow](./guides/development.md); the full pattern in
[Architecture](./guides/architecture.md).

## 4. Call it from the client

```ts
import { apiClient } from "@groot/shell/lib/api";

const posts = await apiClient.get<Post[]>("/posts");
const created = await apiClient.post<Post>("/posts", { title: "Hello" });
```

`apiClient` is a thin `fetch` client: it prefixes `/api/v1`, sends the session
cookie, unwraps `data` and throws an `ApiError` on failure. A 401 is reported to
the session store, which signs the user out. See [Client](./features/client.md).

## Commands

Every `pnpm` script is listed in
[Development workflow](./guides/development.md#commands).

## Production checklist

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET_KEY` (≥ 32 chars) and `ADMIN_AUTH_KEY` set to random values — in production the server will not start without them
- [ ] `RP_ID` and `ORIGIN` set to your public domain (also required in production; passkeys use them)
- [ ] Node: a persistent volume at `/data` (the production default is `file:/data/prod.db`) or `DATABASE_URL` pointing at one, and one replica — or deploy to [Cloudflare Workers](./guides/deploy-cloudflare.md)
- [ ] `CORS_ALLOWED_ORIGINS` set if the API is called from another origin
- [ ] `SENTRY_DSN` (optional)
- [ ] `pnpm build` and `pnpm test` pass

→ Next: [Deploy on Node](./guides/deploy.md) or [Deploy on Cloudflare](./guides/deploy-cloudflare.md).
