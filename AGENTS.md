# 404less — engineering guide

Reference architecture: [open-seo](https://github.com/every-app/open-seo) (adopted for UI & code structure).

## Principles

- Prefer simple, flat, readable code with minimal indirection.
- Thin Hono routes: parse/validate input, delegate to a feature service, map errors to status codes.
  Business logic lives in `src/server/features/<domain>/service.ts`, not in route files.
- Validate untrusted input at trust boundaries (hand-rolled guards today; Zod when schemas grow).
- Client code grouped by feature (`web/src/features/<feature>/`); shared primitives in `web/src/components/ui/`.
  Route files under `web/src/routes/` export only `Route` (the router plugin code-splits them); hooks and
  components live in features.
- TanStack Query for all server state; TanStack Router with file routes (`app.tsx` guards auth and renders the
  shell, `app.sites.$siteId.tsx` resolves the site for its children). List filters live in the URL (`validateSearch`).
- Light theme only — no dark mode.
- URL layout: marketing site at `/` (static HTML from `site/`), dashboard under `/app` (SPA shell
  `web/app.html`, login at `/app/login`), API under `/api`. The Worker's catch-all in `src/index.ts`
  maps `/` and `/<page>` to `dist/web/<page>.html`, `/app/*` to `app.html`, everything else to
  `404.html` with a 404 status (assets use `html_handling: none`). Tokens in `web/src/styles.css`. Minimal palette: graphite is the only brand
  color (primary buttons, active nav, toggles, the data series); everything else is neutral, and semantic colors
  (success/warning/destructive/info) appear only when they mean state. Text links use the `link` utility, not color.
- Keep free-tier ceilings in mind: batch D1 writes, cap per-site data, prune old events, stay inside the
  per-request CPU budget (the suggestion ranker prefilters + caches the known-URL index per isolate).
- Tests run inside workerd via `@cloudflare/vitest-plugin`; integration tests hit `SELF.fetch()`.

## Domain model

- `broken_links` is the managed list: one row per (site, url) with `status` open|resolved|ignored and `source`
  visitor|crawler|both. Both detectors upsert through `src/server/features/links/service.ts`
  (`recordVisitorHit`, `recordCrawlResult`); never write the table from routes.
- Visitor hits reopen resolved rows; crawler success resolves open rows; ignored rows stay ignored and never alert.
- `not_found_events` is the raw visitor log (pruned nightly); `link_checks` is crawler history (30 days).

## Dev

- `npm run dev` — wrangler dev (serves API + built site/SPA from `dist/web` at :8787)
- `npm run dev:web` — Vite SPA dev server (:5173 → /app, proxies /api, /auth, /embed.js to :8787)
- `npm run build:web` — Vite build (`web/app.html` → `dist/web/app.html`) then `site/build.mjs`
  (static marketing pages → `dist/web/*.html`, sitemap, robots)
- `npm run build:og` — re-render Open Graph images (Playwright; `site/assets/og/*.png` is committed
  because Cloudflare's build has no browser)
- `npm test` — vitest in workerd (no Cloudflare account needed)
- `npm run typecheck` / `npm --prefix web run typecheck`
- `npm run deploy` — build SPA + apply D1 migrations + wrangler deploy
