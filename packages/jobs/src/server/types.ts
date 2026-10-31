import type { Logger } from "@groot/core/logger";

export type { Job, NewJob, JobSchedule, JobLog } from "./schema";
export type { JobAction, JobState } from "../lifecycle";
export type { JobStats, BulkRerunResult } from "./wire-types";

/** What a handler receives. */
export interface JobContext<T = unknown> {
  id: string;
  name: string;
  data: T;
  /** 1 for the first run, 2 for the first retry, ... */
  attempt: number;
  /** Logs to the console and to `job_logs` (info and above). */
  logger: Logger;
}

/** A handler may return a JSON-serialisable value; it is stored as the job's `output`. */
export type JobHandler<T = unknown, R = unknown> = (job: JobContext<T>) => Promise<R> | R;

export interface SendJobOptions {
  /** Retries after the first failure. Defaults to `config.jobs.retryLimit`. */
  retryLimit?: number;
  /** Base delay between retries in seconds; doubles each attempt. */
  retryDelaySeconds?: number;
  /** Higher runs first. */
  priority?: number;
  /** Delay the first run. */
  delaySeconds?: number;
  /** Absolute alternative to `delaySeconds`. */
  runAt?: Date;
  /** Only one pending/active job per name + key. Returns the existing id if present. */
  singletonKey?: string;
}

export interface ScheduleJobOptions {
  /** IANA timezone for the cron expression. Defaults to the process time zone (UTC on Workers, `TZ` on Node). */
  timezone?: string;
}

export interface GetJobsOptions {
  state?: string;
  name?: string;
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}

export interface JobQueryResponse {
  jobs: import("./schema").Job[];
  total: number;
}

export interface TickOptions {
  /** Max jobs to claim. Defaults to `config.jobs.batchSize`. */
  limit?: number;
  /** Enqueue due schedules first. Default true. */
  schedules?: boolean;
  /** Run periodic cleanup. Default true. */
  housekeeping?: boolean;
}

export interface TickResult {
  scheduled: number;
  claimed: number;
  completed: number;
  retried: number;
  failed: number;
}
