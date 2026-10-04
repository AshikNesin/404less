// Serve the 404less embed script with immutable caching.
// Source lives in src/embed_js.txt (plain browser JS, no build step).
import { createMiddleware } from 'hono/factory';
import embedJs from '../embed_js.txt';

export function embedRoutes() {
  return createMiddleware(async (c, next) => {
    if (c.req.path === '/embed.js') {
      c.header('Content-Type', 'application/javascript; charset=utf-8');
      c.header('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return c.body(embedJs as unknown as string);
    }
    return next();
  });
}
