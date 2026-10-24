// 404less Worker entrypoint.
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { embedRoutes } from './routes/embed';
import { ingest } from './routes/ingest';
import { auth } from './routes/auth';
import { api } from './routes/api';
import { keys } from './routes/keys';
import { mcp } from './routes/mcp';
import { scheduled, queue } from './cron';

import type { Env } from './types.ts';

const app = new Hono<{ Bindings: Env }>();

app.use('*', logger());
app.use('/api/track', cors({ origin: '*' }));
app.use('/api/suggestions', cors({ origin: '*' }));

app.use('*', embedRoutes());      // serves /embed.js
app.route('/auth', auth);        // POST /auth/magic, GET /auth/verify
app.route('/api', ingest);       // POST /api/track, GET /api/suggestions (public, CORS)
app.route('/api', api);          // dashboard API (session cookie auth)
app.route('/api', keys);         // API-key management (session cookie auth)
app.route('/', mcp);             // POST /mcp (MCP streamable HTTP, bearer auth)

// Static assets with explicit routing (html_handling is off in wrangler.jsonc):
//   /app, /app/*  → the SPA shell (app.html), client-side routed
//   /foo          → foo.html from the marketing site, else the site's 404 page
app.get('*', async (c) => {
  const assets = c.env.ASSETS;
  if (!assets) return c.json({ error: 'not found' }, 404);
  const url = new URL(c.req.url);
  const fetchAsset = (p: string) => assets.fetch(new Request(new URL(p, url.origin), { headers: c.req.raw.headers }));
  if (url.pathname === '/app' || url.pathname.startsWith('/app/')) {
    const res = await fetchAsset('/app.html');
    return new Response(res.body, { status: 200, headers: res.headers });
  }
  // marketing pages: / → index.html, /embed → embed.html, …; anything else → 404.html
  const page = url.pathname === '/' ? '/index.html' : /^\/[a-z0-9-]+$/.test(url.pathname) ? `${url.pathname}.html` : null;
  if (page) {
    const res = await fetchAsset(page);
    if (res.ok) return res;
  }
  const nf = await fetchAsset('/404.html');
  return new Response(nf.body, { status: 404, headers: nf.headers });
});

// Module-format entrypoint. DO classes must be top-level named exports (wrangler
// discovers them by name); handlers ride on the default export object.
export { DigestDO } from './do/digest';
export { RateLimiterDO } from './server/features/quota/service';

export default {
  fetch: app.fetch.bind(app),
  scheduled,
  queue: queue as ExportedHandlerQueueHandler<Env>,
} satisfies ExportedHandler<Env>;
