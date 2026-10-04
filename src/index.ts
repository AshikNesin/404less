// 404less Worker entrypoint.
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { embedRoutes } from './routes/embed';
import { ingest } from './routes/ingest';
import { auth } from './routes/auth';
import { api } from './routes/api';
import { dashboardHtml } from './dashboard_html';
import type { Env } from './types.ts';

const app = new Hono<{ Bindings: Env }>();

app.use('*', logger());
app.use('/api/track', cors({ origin: '*' }));
app.use('/api/suggestions', cors({ origin: '*' }));

app.use('*', embedRoutes());      // serves /embed.js
app.route('/auth', auth);        // POST /auth/magic, GET /auth/verify
app.route('/api', ingest);       // POST /api/track, GET /api/suggestions (public, CORS)
app.route('/api', api);          // dashboard API (session cookie auth)

// dashboard (single-page, zero-build)
app.get('/', (c) => c.html(dashboardHtml));
app.get('/dashboard', (c) => c.html(dashboardHtml));

export default app;
