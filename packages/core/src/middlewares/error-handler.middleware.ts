import type { ErrorHandler, NotFoundHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ErrorCode, reportError, toHttpError } from "../errors";
import { env } from "../env";
import { getBreadcrumbs, logger } from "../logger";
import { getRequestContext } from "../context";
import { fail } from "../utils/api-response.utils";
import type { AppEnv } from "../types";

export const errorHandler: ErrorHandler<AppEnv> = (error, c) => {
  const log = c.get("logger") ?? logger;
  const context = getRequestContext();
  const duration = context ? `${Date.now() - context.startTime}ms` : undefined;
  const http = toHttpError(error);
  const endpoint = `${c.req.method} ${c.req.path}`;

  const errorContext = {
    type: "application_error",
    requestId: context?.requestId,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      isOperational: http?.isOperational ?? false,
    },
    request: { method: c.req.method, path: c.req.path, userAgent: c.req.header("user-agent") },
    performance: duration ? { requestDuration: duration } : undefined,
    breadcrumbs: getBreadcrumbs(),
  };

  // One line per failure: the request logger adds the `→ status` line. The
  // record already carries the request, the timing and the breadcrumbs.
  if (http?.isOperational) {
    log.warn(errorContext, `Operational error: ${error.message}`);
  } else {
    log.error(errorContext, `System error: ${error.message}`);
    reportError(error, { requestId: context?.requestId, endpoint });
  }

  if (http) {
    const { statusCode, message, code, data } = http.output;
    return fail(c, { code, message, details: data }, statusCode as ContentfulStatusCode);
  }

  const isDevelopment = env.NODE_ENV === "development";
  return fail(
    c,
    {
      code: ErrorCode.INTERNAL_ERROR.code,
      message: isDevelopment ? error.message : "An unexpected error occurred",
      details: isDevelopment ? { stack: error.stack } : undefined,
    },
    ErrorCode.INTERNAL_ERROR.status as ContentfulStatusCode,
  );
};

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) => {
  (c.get("logger") ?? logger).warn(
    { type: "not_found_error", method: c.req.method, path: c.req.path },
    `Route not found: ${c.req.method} ${c.req.path}`,
  );
  return fail(
    c,
    { code: ErrorCode.NOT_FOUND.code, message: `Cannot ${c.req.method} ${c.req.path}` },
    ErrorCode.NOT_FOUND.status as ContentfulStatusCode,
  );
};
