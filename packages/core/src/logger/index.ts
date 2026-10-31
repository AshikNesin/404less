/**
 * A small structured logger with a pino-shaped API: `logger.info(data, msg)`,
 * `logger.child(bindings)`, level filtering. JSON lines in production (what
 * Workers Logs and most log shippers expect), a readable single line in dev.
 *
 * Two seams let apps and packages plug in without forking:
 * - a child logger can carry a **record sink** (`child(bindings, { sink })`),
 *   which receives every emitted record on top of the global output — the
 *   jobs package persists its trail that way;
 * - a process-wide **scrubber** (`setScrubber`) runs every field and message
 *   through the app's secret redaction before anything is written.
 */

import { getRequestContext, runWithRequestContext, waitUntil } from "../context";
export { getRequestContext, runWithRequestContext, waitUntil };
export type { RequestContext } from "../context";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "silent";

const LEVEL_VALUE: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Number.POSITIVE_INFINITY,
};

export type LogData = Record<string, unknown>;

export interface LogFn {
  (message: string): void;
  (data: LogData | Error, message?: string): void;
}

/**
 * Receives every record a logger (and its children) emit, after scrubbing.
 * Sinks are a persistence path, not console output: they fire regardless of
 * the global level, so a `silent` console still leaves a trail.
 */
export type RecordSink = (record: LogRecord) => void;

export interface LoggerOptions {
  sink?: RecordSink;
}

export interface Logger {
  readonly bindings: LogData;
  trace: LogFn;
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  fatal: LogFn;
  /** Children inherit the sink unless `options` replaces it. */
  child(bindings: LogData, options?: LoggerOptions): Logger;
}

export interface LoggerSettings {
  level: LogLevel;
  /** Human-readable output instead of JSON lines. */
  pretty: boolean;
  /** Fields added to every record (service name, env, ...). */
  base: LogData;
  /** Where lines go. Defaults to the console, mapped by level. */
  write: (level: LogLevel, line: string, record: LogRecord) => void;
}

export interface LogRecord extends LogData {
  level: LogLevel;
  time: string;
  msg: string;
}

const settings: LoggerSettings = {
  level: "info",
  pretty: false,
  base: {},
  write: writeToConsole,
};

export function configureLogger(next: Partial<LoggerSettings>): void {
  Object.assign(settings, next);
}

export function getLoggerSettings(): Readonly<LoggerSettings> {
  return settings;
}

export function isLevelEnabled(level: LogLevel): boolean {
  return LEVEL_VALUE[level] >= LEVEL_VALUE[settings.level];
}

export function serializeError(error: Error): LogData {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(error.cause !== undefined ? { cause: String(error.cause) } : {}),
  };
}

function normalize(data: LogData): LogData {
  const out: LogData = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = value instanceof Error ? serializeError(value) : value;
  }
  return out;
}

function writeToConsole(level: LogLevel, line: string): void {
  if (level === "error" || level === "fatal") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

const COLORS: Record<string, string> = {
  trace: "\u001b[90m",
  debug: "\u001b[36m",
  info: "\u001b[32m",
  warn: "\u001b[33m",
  error: "\u001b[31m",
  fatal: "\u001b[35m",
  reset: "\u001b[0m",
  dim: "\u001b[2m",
};

function formatPretty(record: LogRecord): string {
  const { level, time, msg, ...rest } = record;
  for (const key of Object.keys(settings.base)) delete rest[key];
  const extras =
    Object.keys(rest).length > 0 ? `${COLORS.dim}${JSON.stringify(rest)}${COLORS.reset}` : "";
  const clock = time.slice(11, 19);
  return `${COLORS.dim}${clock}${COLORS.reset} ${COLORS[level]}${level.toUpperCase().padEnd(5)}${COLORS.reset} ${msg}${extras}`;
}

function emit(
  level: LogLevel,
  bindings: LogData,
  args: [string] | [LogData | Error, string?],
  sink?: RecordSink,
): void {
  const toConsole = isLevelEnabled(level);
  if (!toConsole && !sink) return;

  let data: LogData = {};
  let msg: string;
  if (typeof args[0] === "string") {
    msg = args[0];
  } else if (args[0] instanceof Error) {
    data = { err: args[0] };
    msg = args[1] ?? args[0].message;
  } else {
    data = args[0];
    msg = args[1] ?? "";
  }

  const record: LogRecord = {
    level,
    time: new Date().toISOString(),
    ...settings.base,
    ...bindings,
    ...scrubValue(normalize(data)),
    msg: scrubText(msg),
  };
  if (sink) sink(record);
  if (toConsole) {
    settings.write(level, settings.pretty ? formatPretty(record) : JSON.stringify(record), record);
  }
}

export function createLogger(bindings: LogData = {}, options: LoggerOptions = {}): Logger {
  const level = (name: LogLevel): LogFn =>
    ((...args: [string] | [LogData | Error, string?]) =>
      emit(name, bindings, args, options.sink)) as LogFn;
  return {
    bindings,
    trace: level("trace"),
    debug: level("debug"),
    info: level("info"),
    warn: level("warn"),
    error: level("error"),
    fatal: level("fatal"),
    child: (extra, nextOptions) =>
      createLogger({ ...bindings, ...extra }, { sink: nextOptions?.sink ?? options.sink }),
  };
}

/** The root logger. Child loggers inherit the settings applied via `configureLogger`. */
export const logger: Logger = createLogger();

/**
 * A process-wide scrub hook for logs and error reports. The app registers a
 * function that replaces secret values it knows about (a vault redactor);
 * the logger runs every message and field through it. Without a registered
 * scrubber everything passes through unchanged.
 */

type Scrubber = (text: string) => string;

let scrubber: Scrubber | undefined;

/** Field names whose string values are always replaced, whoever logs them. */
const SECRET_KEYS = new Set([
  "password",
  "secret",
  "cvc",
  "cvv",
  "cardnumber",
  "totp",
  "otp",
  "authorization",
]);

export function setScrubber(fn: Scrubber | undefined): void {
  scrubber = fn;
}

export function scrubText(text: string): string {
  return scrubber ? scrubber(text) : text;
}

/** A copy of `value` with secret-named fields masked and every string scrubbed. */
export function scrubValue<T>(value: T, depth = 0): T {
  if (typeof value === "string") return scrubText(value) as T;
  if (depth > 8 || !value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1)) as T;
  if (value instanceof Error) return value;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] =
      SECRET_KEYS.has(key.toLowerCase()) && typeof item === "string"
        ? "[REDACTED]"
        : scrubValue(item, depth + 1);
  }
  return out as T;
}

/**
 * Record a step on the current request's trail. Breadcrumbs are attached to
 * error logs so a failure shows what led up to it. Outside a request context
 * they are dropped.
 */

export interface Breadcrumb {
  timestamp: string;
  category: string;
  message: string;
  level: "debug" | "info" | "warn" | "error";
  data?: Record<string, unknown>;
}

const MAX_BREADCRUMBS = 50;

export function addBreadcrumb(
  category: string,
  message: string,
  level: Breadcrumb["level"] = "info",
  data?: Record<string, unknown>,
): void {
  const context = getRequestContext();
  if (!context) return;
  context.breadcrumbs.push({ timestamp: new Date().toISOString(), category, message, level, data });
  if (context.breadcrumbs.length > MAX_BREADCRUMBS) context.breadcrumbs.shift();
}

export function getBreadcrumbs(): Breadcrumb[] {
  return [...(getRequestContext()?.breadcrumbs ?? [])];
}

export interface LogPerformanceOptions {
  operation: string;
  duration: number;
  data?: Record<string, unknown>;
}

/** Timing record (`type: "performance"`); escalates to warn past 5s. */
export function logPerformance(options: LogPerformanceOptions): void {
  const { operation, duration, data = {} } = options;
  const level = duration > 5000 ? "warn" : duration > 1000 ? "info" : "debug";
  logger[level](
    { type: "performance", operation, duration: `${duration}ms`, ...data },
    `Performance: ${operation} completed in ${duration}ms`,
  );
}
