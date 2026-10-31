/**
 * Client-facing job types. The response shapes (`Job`, `JobSchedule`,
 * `JobLog`, `JobStats`, `BulkRerunResult`) are the wire types the server
 * publishes in `@groot/jobs/server/wire-types`, re-exported here so existing
 * imports from `@groot/jobs/client/types` keep working. The import is
 * type-only: no server code ships to the client.
 */
import type { BulkRerunResult, Job, JobLog, JobSchedule, JobStats } from "../server/wire-types";

/**
 * A registered job/queue name. Generic string — project-specific job names
 * live with their handlers (e.g. apps/web/src/server/api/todo/todo.jobs.ts).
 */
export type JobName = string;

export type { JobAction, JobState } from "../lifecycle";
export type { BulkRerunResult, Job, JobLog, JobSchedule, JobStats };

/** Dashboard-side name for a {@link JobSchedule} row. */
export type ScheduledJob = JobSchedule;

/** Options accepted by `POST /api/v1/jobs`. */
export interface AddJobOptions {
  /** Retries after the first failure. */
  retryLimit?: number;
  /** Base delay between retries in seconds; doubles each attempt. */
  retryDelaySeconds?: number;
  /** Higher runs first. */
  priority?: number;
  /** Delay the first run. */
  delaySeconds?: number;
  /** Only one pending/active job per name + key. */
  singletonKey?: string;
}

/** Options accepted by `POST /api/v1/jobs/schedule`. */
export interface ScheduleJobOptions {
  /** IANA timezone for the cron expression. Defaults to the process time zone (UTC on Workers, `TZ` on Node). */
  timezone?: string;
}
