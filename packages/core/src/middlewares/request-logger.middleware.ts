import { createMiddleware } from "hono/factory";
import { runWithRequestContext } from "../context";
import { logger } from "../logger";
import { clientIp } from "../utils/controller.utils";
import type { AppEnv } from "../types";

/**
 * Opens the per-request context (request id, breadcrumbs, `waitUntil`), attaches
 * a child logger to the Hono context and logs one line per request.
 */
export const requestLoggerMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
  const startTime = Date.now();

  // Workers expose the execution context; Node throws when it is absent.
  let waitUntil: ((promise: Promise<unknown>) => void) | undefined;
  try {
    const executionCtx = c.executionCtx;
    waitUntil = (promise) => executionCtx.waitUntil(promise);
  } catch {
    waitUntil = undefined;
  }

  const log = logger.child({
    reqId: requestId,
    method: c.req.method,
    url: c.req.path,
    userAgent: c.req.header("user-agent"),
    ip: clientIp(c),
  });
  c.set("requestId", requestId);
  c.set("logger", log);
  c.header("x-request-id", requestId);

  await runWithRequestContext({ requestId, startTime, waitUntil }, async () => {
    await next();
    const duration = Date.now() - startTime;
    const status = c.res.status;
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    log[level](
      { statusCode: status, duration: `${duration}ms` },
      `${c.req.method} ${c.req.path} → ${status} in ${duration}ms`,
    );
  });
});
