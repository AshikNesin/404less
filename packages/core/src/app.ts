import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { config } from "./config";
import { requestLoggerMiddleware } from "./middlewares/request-logger.middleware";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler.middleware";
import type { AppEnv } from "./types";

export interface CreateAppOptions {
  /** Mount feature routers: `app.route("/api/v1/todos", todoRoutes)`. */
  routes?: (app: Hono<AppEnv>) => void;
  /**
   * Readiness probe for `/health` and `/ready`. Return a reason string while
   * the app is not ready and `undefined` once it is.
   */
  readiness?: () => string | undefined;
  /** Max JSON body size for API routes. Storage uploads set their own limit. */
  bodyLimitBytes?: number;
  /**
   * Public endpoints any website may call without credentials (embeddable
   * widgets, tracking pixels): they answer `Access-Control-Allow-Origin: *`
   * and skip the app's credentialed CORS allow-list. Exact paths, or a prefix
   * ending in `*` (`"/api/public/*"`).
   */
  openCorsPaths?: string[];
}

/** True when `path` is one of the `openCorsPaths` (exact, or `prefix*`). */
function matchesPath(paths: readonly string[], path: string): boolean {
  return paths.some((p) => (p.endsWith("*") ? path.startsWith(p.slice(0, -1)) : path === p));
}

let shuttingDown = false;

/** Flip `/health` to 503 so load balancers drain traffic before exit. */
export function markShuttingDown(): void {
  shuttingDown = true;
}

/**
 * The shared Hono app: request context + logging, CORS, body limits, health
 * probes, your routes, then the JSON error envelope. Both the Node and Workers
 * entries call this; only the way it is served differs.
 */
export function createApp(options: CreateAppOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const limit = bodyLimit({ maxSize: options.bodyLimitBytes ?? 1024 * 1024 });

  const openPaths = options.openCorsPaths ?? [];
  const openCors = cors({ origin: "*" });
  const appCors = cors({
    origin: (origin) =>
      config.cors.origins.length === 0 || config.cors.origins.includes(origin) ? origin : null,
    credentials: true,
  });

  app.use(requestLoggerMiddleware);
  app.use((c, next) => (matchesPath(openPaths, c.req.path) ? openCors(c, next) : appCors(c, next)));
  app.use("/api/*", (c, next) =>
    c.req.path.startsWith("/api/v1/storage/") ? next() : limit(c, next),
  );

  const probe = () => {
    if (shuttingDown) return { status: 503 as const, body: { status: "shutting_down" } };
    const reason = options.readiness?.();
    if (reason) return { status: 503 as const, body: { status: "not_ready", reason } };
    return { status: 200 as const, body: { status: "ok" } };
  };

  app.get("/health", (c) => {
    const { status, body } = probe();
    return c.json({ ...body, timestamp: new Date().toISOString() }, status);
  });
  app.get("/ready", (c) => {
    const { status, body } = probe();
    return c.json(
      status === 200 ? { ready: true } : { ready: false, reason: body.reason ?? body.status },
      status,
    );
  });

  options.routes?.(app);

  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}
