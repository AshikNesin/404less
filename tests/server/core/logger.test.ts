import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  addBreadcrumb,
  configureLogger,
  createLogger,
  getBreadcrumbs,
  getLoggerSettings,
  logPerformance,
  logger,
  runWithRequestContext,
  scrubValue,
  setScrubber,
  type LogRecord,
} from "@groot/core/logger";

const original = { ...getLoggerSettings() };
afterEach(() => {
  configureLogger(original);
  setScrubber(undefined);
});

function capture() {
  const records: LogRecord[] = [];
  configureLogger({
    level: "trace",
    pretty: false,
    write: (_level, _line, record) => records.push(record),
  });
  return records;
}

describe("logger", () => {
  it("filters by level and serialises errors", () => {
    const records = capture();
    configureLogger({ level: "warn" });
    logger.info("dropped");
    logger.warn({ code: 1 }, "kept");
    logger.error(new Error("boom"));
    expect(records.map((r) => r.msg)).toEqual(["kept", "boom"]);
    expect(records[0]).toMatchObject({ level: "warn", code: 1 });
    expect((records[1]!.err as { message: string }).message).toBe("boom");
  });

  it("child loggers carry bindings", () => {
    const records = capture();
    createLogger({ service: "x" }).child({ reqId: "r1" }).info("hi");
    expect(records[0]).toMatchObject({ service: "x", reqId: "r1", msg: "hi" });
  });

  it("a record sink receives every record, inherited by children, even below the console level", () => {
    const sunk: LogRecord[] = [];
    const lines: string[] = [];
    configureLogger({ level: "info", write: (_level, line) => lines.push(line) });
    const child = createLogger({ component: "jobs" }, { sink: (record) => sunk.push(record) });
    child.info("kept by sink");
    child.child({ jobId: "j1" }).debug({ step: 2 }, "sunk, not printed");
    expect(sunk.map((r) => r.msg)).toEqual(["kept by sink", "sunk, not printed"]);
    expect(sunk[1]).toMatchObject({ component: "jobs", jobId: "j1", step: 2 });
    expect(lines).toHaveLength(1); // the debug record never reached the console
  });

  it("scrubs messages, fields and secret-named values", () => {
    setScrubber((text) => text.replaceAll("hunter2", "***"));
    const records = capture();
    logger.info({ password: "hunter2", nested: { token: "safe" } }, "login hunter2 attempt");
    expect(records[0]).toMatchObject({ password: "[REDACTED]", msg: "login *** attempt" });
    expect(scrubValue({ ok: "hunter2", arr: ["hunter2"] })).toEqual({ ok: "***", arr: ["***"] });
  });

  it("logPerformance escalates slow operations", () => {
    const records = capture();
    logPerformance({ operation: "fast", duration: 10 });
    logPerformance({ operation: "slow", duration: 6000 });
    expect(records.map((r) => r.level)).toEqual(["debug", "warn"]);
  });

  it("breadcrumbs live in the request context", () => {
    addBreadcrumb("db", "outside"); // dropped
    expect(getBreadcrumbs()).toEqual([]);
    runWithRequestContext({}, () => {
      addBreadcrumb("db", "query", "debug", { ms: 1 });
      expect(getBreadcrumbs()).toHaveLength(1);
      expect(getBreadcrumbs()[0]).toMatchObject({
        category: "db",
        message: "query",
        level: "debug",
      });
    });
  });
});
