# 404less

Self-hostable real-time broken-link monitoring on Cloudflare's free tier.

- [Design doc](docs/DESIGN.md)
- Stack: Cloudflare Workers + D1 + Hono + Drizzle (typed schema), TypeScript
- Phase: M1 (auth, teams/sites, embed + ingest, events API)

## Testing without deploying anything

```bash
npm test        # integration tests run inside workerd + local D1 (Miniflare). No CF account.
npm run dev     # interactive: real Workers runtime at http://localhost:8787
```

- `npm test` spins up the actual Worker entrypoint (`src/index.ts`) in Miniflare's
  workerd, applies the D1 migrations to an isolated SQLite instance, and runs the
  suite with `SELF.fetch()` — the same code that would run on Cloudflare, zero network.
- `npm run dev` is the full app locally: dashboard at `/`, magic-link login returns a
  `devLink` in the API response when `RESEND_API_KEY` is unset (no emails needed).
- Email (Resend) and external fetches can be exercised later with `.dev.vars`.

## Quick start (local)

```bash
npm install
npx wrangler d1 migrations apply DB --local
npm run dev
```

Dev mode without `RESEND_API_KEY`: magic-link emails are logged to the console and
the link is returned in the API response (`devLink`) — easy local testing.

## Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/YOUR_USER/404less)

```bash
npx wrangler d1 create 404less   # paste database_id into wrangler.jsonc
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
npx wrangler secret put RESEND_API_KEY   # optional; enables email sign-in links
```

## Embed

```html
<script src="https://your-worker.example.com/embed.js" data-site="SITE_KEY" defer></script>
```
