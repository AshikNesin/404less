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

// Module-format entrypoint. DO classes must be top-level named exports (wrangler
// discovers them by name); handlers ride on the default export object.
export { DigestDO } from './do/digest';

export default {
  fetch: app.fetch.bind(app),
  scheduled,
  queue: queue as ExportedHandlerQueueHandler<Env>,
} satisfies ExportedHandler<Env>;
