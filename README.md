# 404less

Self-hostable real-time broken-link monitoring on Cloudflare's free tier.

- [Design doc](docs/DESIGN.md)
- Stack: Cloudflare Workers + D1 + Hono + Drizzle (typed schema), TypeScript
- Phase: M1 (auth, teams/sites, embed + ingest, events API)

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
