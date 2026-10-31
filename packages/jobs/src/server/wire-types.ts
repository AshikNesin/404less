/**
 * Wire types for the jobs API: what `/api/v1/jobs` returns over JSON. Each
 * type is the matching row from `./schema` with every timestamp as an ISO
 * string (Hono serializes `Date` via `JSON.stringify`), so client code can
 * import these type-only and get exactly what the API sends.
 *
 * The field set comes from the schema, so adding a column there updates the
 * wire type; when the new column is a `timestamp_ms`, add it to the `Omit`
 * list and redeclare it as `string` here.
 */
import type { JobState } from "../lifecycle";
import type { Job as JobRow, JobLog as JobLogRow, JobSchedule as JobScheduleRow } from "./schema";

/** A job as served by `/api/v1/jobs`. Timestamps arrive as ISO strings. */
export type Job = Omit<JobRow, "runAt" | "startedAt" | "completedAt" | "createdAt"> & {
  /** Earliest time the job may run (ISO string). */
  runAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

/** A cron schedule as served by `/api/v1/jobs/schedule`. One schedule per job name. */
export type JobSchedule = Omit<JobScheduleRow, "lastRunAt" | "createdAt" | "updatedAt"> & {
  /** Last time the tick enqueued a job for this schedule (ISO string). */
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A job log entry as served by `/api/v1/jobs/:jobId/logs`. */
export type JobLog = Omit<JobLogRow, "timestamp"> & {
  timestamp: string;
};

/** Per-state job counts from `/api/v1/jobs/stats`. */
export type JobStats = Record<JobState, number>;

/** One entry of the `POST /api/v1/jobs/bulk-rerun` response. */
export interface BulkRerunResult {
  jobId: string;
  success: boolean;
  newJobId?: string;
  error?: string;
}
