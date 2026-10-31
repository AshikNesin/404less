import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";
import type { JobState } from "../lifecycle";

/**
 * Job tables. The queue is the database: `jobs` rows move through
 * created → active → completed | failed | cancelled, claimed by `runTick()`.
 */

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    data: text("data", { mode: "json" }).$type<unknown>(),
    state: text("state").$type<JobState>().notNull().default("created"),
    priority: integer("priority").notNull().default(0),
    retryLimit: integer("retry_limit").notNull().default(0),
    retryCount: integer("retry_count").notNull().default(0),
    /** Base delay between retries, in seconds (doubles per attempt). */
    retryDelay: integer("retry_delay").notNull().default(0),
    /** Earliest time the job may run. */
    runAt: integer("run_at", { mode: "timestamp_ms" }).notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    /** Handler return value, when JSON-serialisable. */
    output: text("output", { mode: "json" }).$type<unknown>(),
    /** Last error message. */
    error: text("error"),
    /** Prevents duplicate pending jobs with the same name + key. */
    singletonKey: text("singleton_key"),
  },
  (table) => [
    index("jobs_state_run_at_idx").on(table.state, table.runAt),
    index("jobs_state_completed_at_idx").on(table.state, table.completedAt),
    index("jobs_name_idx").on(table.name),
    index("jobs_created_at_idx").on(table.createdAt),
  ],
);

export const jobSchedules = sqliteTable("job_schedules", {
  name: text("name").primaryKey(),
  cron: text("cron").notNull(),
  data: text("data", { mode: "json" }).$type<unknown>(),
  timezone: text("timezone"),
  /** Last time the tick enqueued a job for this schedule. */
  lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

export const jobLogs = sqliteTable(
  "job_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: text("job_id").notNull(),
    jobName: text("job_name"),
    level: text("level").notNull(),
    message: text("message").notNull(),
    data: text("data", { mode: "json" }).$type<unknown>(),
    timestamp: integer("timestamp", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("job_logs_job_id_idx").on(table.jobId)],
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type JobSchedule = typeof jobSchedules.$inferSelect;
export type JobLog = typeof jobLogs.$inferSelect;
