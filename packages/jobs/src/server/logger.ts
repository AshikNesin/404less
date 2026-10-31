import {
  getLoggerSettings,
  logger,
  type LogData,
  type Logger,
  type LogRecord,
} from "@groot/core/logger";
import { inArray } from "drizzle-orm";
import { db } from "@groot/core/database";
import { jobLogs } from "./schema";

/**
 * A job logger writes to the normal log stream and persists `info` and above
 * to `job_logs` so the dashboard can show a per-job trail. The persistence is
 * a record sink on a core child logger, so argument handling, level filtering
 * and scrubbing behave exactly like every other logger. Writes are tracked so
 * the tick can `flushJobLogs()` before it marks the job done.
 */
export interface CreateJobLoggerOptions {
  jobId: string;
  jobName: string;
  additionalContext?: LogData;
}

const PERSISTED_LEVELS = new Set<string>(["info", "warn", "error", "fatal"]);
const pending = new Set<Promise<unknown>>();

function persistSink(jobId: string, jobName: string): (record: LogRecord) => void {
  return (record) => {
    if (!PERSISTED_LEVELS.has(record.level)) return;
    const { level, msg, time, jobId: _jobId, jobName: _jobName, ...rest } = record;
    // Rows carry the caller's data, not the logger's base fields (service, env).
    const base = getLoggerSettings().base;
    const data: LogData = {};
    for (const [key, value] of Object.entries(rest)) {
      if (!(key in base)) data[key] = value;
    }
    const write = db
      .insert(jobLogs)
      .values({
        jobId,
        jobName,
        level,
        message: msg,
        data: Object.keys(data).length > 0 ? data : null,
        timestamp: new Date(time),
      })
      .then(() => undefined)
      .catch((error: unknown) => logger.error({ err: error, jobId }, "Failed to persist job log"));
    pending.add(write);
    void write.finally(() => pending.delete(write));
  };
}

export function createJobLogger(options: CreateJobLoggerOptions): Logger {
  const { jobId, jobName, additionalContext = {} } = options;
  return logger.child(
    { jobId, jobName, ...additionalContext },
    { sink: persistSink(jobId, jobName) },
  );
}

// D1 binds at most 100 parameters per statement.
const DELETE_CHUNK_SIZE = 90;

/** Delete the `job_logs` rows of the given jobs (indexed on `job_id`). */
export async function deleteJobLogs(jobIds: readonly string[]): Promise<void> {
  for (let start = 0; start < jobIds.length; start += DELETE_CHUNK_SIZE) {
    const chunk = jobIds.slice(start, start + DELETE_CHUNK_SIZE);
    await db.delete(jobLogs).where(inArray(jobLogs.jobId, chunk));
  }
}

/** Wait for every in-flight `job_logs` write. */
export async function flushJobLogs(): Promise<void> {
  await Promise.allSettled(pending);
}
