import { HTTPException } from "hono/http-exception";

/**
 * HTTP errors end to end: the `HttpError` class, the `Boom` factories,
 * normalisation of anything thrown (SQLite constraints, Hono exceptions) and
 * the error-reporting seam the runtime entries point at Sentry.
 */

const STATUS_PHRASES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  407: "Proxy Authentication Required",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  411: "Length Required",
  412: "Precondition Failed",
  413: "Payload Too Large",
  414: "URI Too Long",
  415: "Unsupported Media Type",
  416: "Range Not Satisfiable",
  417: "Expectation Failed",
  418: "I'm a Teapot",
  422: "Unprocessable Entity",
  423: "Locked",
  424: "Failed Dependency",
  425: "Too Early",
  428: "Precondition Required",
  429: "Too Many Requests",
  431: "Request Header Fields Too Large",
  451: "Unavailable For Legal Reasons",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

export interface HttpErrorOutput {
  statusCode: number;
  error: string;
  message: string;
  code: string;
  data?: unknown;
}

/**
 * Unified HTTP error class inspired by @hapi/boom.
 *
 * Use the `Boom` factory namespace to create instances:
 *
 * ```ts
 * throw Boom.notFound("User not found");
 * throw Boom.conflict("Email already taken", { email });
 * throw Boom.badRequest("Invalid input", validationErrors, "VALIDATION_ERROR");
 * ```
 */
export class HttpError extends Error {
  /** HTTP status code (e.g. 404, 500) */
  readonly statusCode: number;

  /** Machine-readable error code (e.g. "NOT_FOUND", "VALIDATION_ERROR") */
  readonly code: string;

  /**
   * Whether this error is an expected, operational error (true)
   * or an unexpected programmer/system error (false).
   * 5xx errors default to false; 4xx default to true.
   */
  readonly isOperational: boolean;

  /** Arbitrary structured data attached to the error (like Boom's `data`). */
  readonly data?: unknown;

  constructor(statusCode: number, message?: string, data?: unknown, code?: string, cause?: Error) {
    const phrase = STATUS_PHRASES[statusCode] ?? "Unknown Error";
    super(message ?? phrase, { cause });

    this.statusCode = statusCode;
    this.code = code ?? statusCodeToCode(statusCode);
    this.isOperational = statusCode < 500;
    this.data = data;

    // Fix prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  /** Pre-formatted response payload, ready to send as JSON. */
  get output(): HttpErrorOutput {
    const base: HttpErrorOutput = {
      statusCode: this.statusCode,
      error: STATUS_PHRASES[this.statusCode] ?? "Unknown Error",
      message: this.message,
      code: this.code,
    };

    if (this.data !== undefined && this.data !== null) {
      base.data = this.data;
    }

    return base;
  }
}

/**
 * Derives a SCREAMING_SNAKE_CASE code from an HTTP status code.
 * e.g. 404 → "NOT_FOUND", 429 → "TOO_MANY_REQUESTS"
 */
function statusCodeToCode(statusCode: number): string {
  const phrase = STATUS_PHRASES[statusCode];
  if (!phrase) return `HTTP_${statusCode}`;
  return phrase.toUpperCase().replaceAll(/[^A-Z0-9]+/g, "_");
}

/**
 * Error codes that carry meaning beyond the HTTP status. Domain modules add
 * their own as plain strings (`Boom.notFound("Job not found", null,
 * "JOB_NOT_FOUND")`); only codes shared across core live here.
 */
export const ErrorCode = {
  VALIDATION_ERROR: { code: "VALIDATION_ERROR", status: 400 },
  NOT_FOUND: { code: "NOT_FOUND", status: 404 },
  RATE_LIMIT_EXCEEDED: { code: "RATE_LIMIT_EXCEEDED", status: 429 },
  UPLOAD_RATE_LIMIT_EXCEEDED: { code: "UPLOAD_RATE_LIMIT_EXCEEDED", status: 429 },
  INTERNAL_ERROR: { code: "INTERNAL_ERROR", status: 500 },
} satisfies Record<string, { code: string; status: number }>;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode]["code"];

function createFactory(statusCode: number) {
  return (message?: string, data?: unknown, code?: string): HttpError =>
    new HttpError(statusCode, message, data, code);
}

/**
 * Boom-style error factory namespace. Every method returns an `HttpError`
 * instance — just throw it.
 */
export const Boom = {
  /** 400 Bad Request */
  badRequest: createFactory(400),

  /** 401 Unauthorized */
  unauthorized: createFactory(401),

  /** 403 Forbidden */
  forbidden: createFactory(403),

  /** 404 Not Found */
  notFound: createFactory(404),

  /** 409 Conflict */
  conflict: createFactory(409),

  /** 413 Payload Too Large */
  entityTooLarge: createFactory(413),

  /** 415 Unsupported Media Type */
  unsupportedMediaType: createFactory(415),

  /** 422 Unprocessable Entity */
  unprocessable: createFactory(422),

  /** 429 Too Many Requests */
  tooManyRequests: createFactory(429),

  /** 502 Bad Gateway */
  badGateway: createFactory(502),

  /** 503 Service Unavailable */
  unavailable: createFactory(503),

  /**
   * Type guard: returns `true` if the value is an `HttpError` instance.
   */
  isHttpError(err: unknown): err is HttpError {
    return err instanceof HttpError;
  },

  /**
   * Wraps any error into an `HttpError`.
   *
   * If the error is already an `HttpError`, returns it as-is.
   * Otherwise creates a 500 Internal Server Error with the original as `cause`.
   */
  boomify(err: unknown, options?: { statusCode?: number; message?: string }): HttpError {
    if (err instanceof HttpError) return err;

    const statusCode = options?.statusCode ?? 500;
    const message =
      options?.message ?? (err instanceof Error ? err.message : "An unexpected error occurred");
    const cause = err instanceof Error ? err : undefined;

    return new HttpError(statusCode, message, undefined, undefined, cause);
  },
} as const;

/**
 * Map SQLite constraint failures (better-sqlite3 on Node, D1 on Workers) to
 * HTTP errors. Both drivers surface the SQLite message text, e.g.
 * `UNIQUE constraint failed: users.email`, so one regex set covers both.
 */
function fromSqliteConstraint(error: unknown): HttpError | null {
  const message = error instanceof Error ? error.message : String(error);

  const unique = /UNIQUE constraint failed: \w+\.(\w+)/.exec(message);
  if (unique) return Boom.conflict(`A record with this ${unique[1]} already exists`);

  if (/FOREIGN KEY constraint failed/.test(message)) {
    return Boom.badRequest("Cannot perform this operation due to related records");
  }

  const notNull = /NOT NULL constraint failed: \w+\.(\w+)/.exec(message);
  if (notNull) return Boom.badRequest(`${notNull[1]} is required`);

  if (/CHECK constraint failed/.test(message)) return Boom.badRequest("Invalid data provided");

  return null;
}

/**
 * Normalise anything thrown into an `HttpError`: `HttpError` passes through,
 * SQLite constraint failures map to 409/400, Hono's own `HTTPException`
 * keeps its status. Returns `null` for everything else (a 500).
 */
export function toHttpError(error: unknown): HttpError | null {
  if (error instanceof HttpError) return error;
  const constraint = fromSqliteConstraint(error);
  if (constraint) return constraint;
  if (error instanceof HTTPException) {
    return Boom.boomify(error, { statusCode: error.status, message: error.message });
  }
  return null;
}

/**
 * Error reporting seam. Core code calls `reportError`; the runtime entry
 * (Node or Workers) plugs in Sentry or anything else via `setErrorReporter`.
 * Without a reporter it is a no-op, which is the right default for tests.
 */
export type ErrorReporter = (error: unknown, context?: Record<string, unknown>) => void;

let reporter: ErrorReporter = () => undefined;

export function setErrorReporter(next: ErrorReporter): void {
  reporter = next;
}

export function reportError(error: unknown, context?: Record<string, unknown>): void {
  try {
    reporter(error, context);
  } catch {
    // Reporting must never take the request down with it.
  }
}
