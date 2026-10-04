# 404less — engineering guide

Reference architecture: [open-seo](https://github.com/every-app/open-seo) (adopted for UI & code structure).

## Principles

- Prefer simple, flat, readable code with minimal indirection.
- Thin Hono routes: parse/validate input, delegate to a feature service, map errors to status codes.
  Business logic lives in `src/server/features/<domain>/service.ts`, not in route files.
- Validate untrusted input at trust boundaries (hand-rolled guards today; Zod when schemas grow).
- Client code grouped by feature (`web/src/features/<feature>/`); shared primitives in `web/src/components/`.
- TanStack Query for all server state; TanStack Router with route layouts (`_app` shell guards auth).
- Light theme only — no dark mode.
- Keep free-tier ceilings in mind: batch D1 writes, cap per-site data, prune old events.
- Tests run inside workerd via `@cloudflare/vitest-plugin`; integration tests hit `SELF.fetch()`.

## Dev

- `npm run dev` — wrangler dev (API at :8787)
- `npm run dev:web` — Vite SPA dev server (:5173, proxies /api + /auth to :8787)
- `npm test` — vitest in workerd (no Cloudflare account needed)
- `npm run deploy` — build SPA + apply D1 migrations + wrangler deploy
