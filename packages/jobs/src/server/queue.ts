import { and, eq, inArray } from "drizzle-orm";
import { Cron } from "croner";
import { db } from "@groot/core/database";
import { config } from "@groot/core/config";
import { Boom } from "@groot/core/errors";
import { logger, waitUntil } from "@groot/core/logger";
import { JOB_ACTIONS, canApplyJobAction, type JobAction, type JobState } from "../lifecycle";
import { defaultJobOptions } from "./config";
import { deleteJobLogs } from "./logger";
import { jobs, jobSchedules, type Job, type JobSchedule, type NewJob } from "./schema";
import { getJobHandler } from "./worker";
import { runTick } from "./tick";
import type { BulkRerunResult, ScheduleJobOptions, SendJobOptions } from "./types";

function assertJobName(name: string): void {
  if (!name) {
    throw Boom.badRequest(`Invalid job name: ${name}`, null, "JOB_NAME_INVALID");
  }
}

/** Queue a job. Returns its id. */
export async function addJob<T = unknown>(
  name: string,
  data: T,
  options: SendJobOptions = {},
): Promise<string> {
  assertJobName(name);
  const defaults = defaultJobOptions();
  const runAt = options.runAt ?? new Date(Date.now() + (options.delaySeconds ?? 0) * 1000);

  if (options.singletonKey) {
    const [existing] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.name, name),
          eq(jobs.singletonKey, options.singletonKey),
          inArray(jobs.state, ["created", "active"]),
        ),
      )
      .limit(1);
    if (existing) return existing.id;
  }

  const id = crypto.randomUUID();
  await db.insert(jobs).values({
    id,
    name,
    data: data ?? null,
    state: "created",
    priority: options.priority ?? defaults.priority,
    retryLimit: options.retryLimit ?? defaults.retryLimit,
    retryDelay: options.retryDelaySeconds ?? defaults.retryDelaySeconds,
    runAt,
    singletonKey: options.singletonKey ?? null,
  });
  logger.info({ jobId: id, name }, "Job queued");

  // Run promptly instead of waiting for the next poll / cron fire. On Workers
  // this rides the request's waitUntil; on Node it is a detached tick.
  if (
    config.jobs.enabled &&
    config.jobs.runInline &&
    runAt.getTime() <= Date.now() &&
    getJobHandler(name)
  ) {
    waitUntil(runTick({ schedules: false, housekeeping: false }));
  }
  return id;
}

function assertCron(cron: string, timezone?: string): void {
  try {
    new Cron(cron, { timezone });
  } catch (error) {
    throw Boom.badRequest(
      `Invalid cron expression: ${error instanceof Error ? error.message : String(error)}`,
      null,
      "JOB_SCHEDULE_VALIDATION_ERROR",
    );
  }
}

/**
 * Create or replace the recurring schedule for `name`. Replacing keeps
 * `lastRunAt`, so editing a schedule does not re-fire a run it already made.
 */
export async function scheduleJob(
  name: string,
  data: unknown,
  cron: string,
  options: ScheduleJobOptions = {},
): Promise<JobSchedule> {
  assertJobName(name);
  assertCron(cron, options.timezone);
  const values = { name, cron, data: data ?? null, timezone: options.timezone ?? null };
  const [schedule] = await db
    .insert(jobSchedules)
    .values(values)
    .onConflictDoUpdate({ target: jobSchedules.name, set: { ...values, updatedAt: new Date() } })
    .returning();
  logger.info({ name, cron }, "Job scheduled");
  return schedule!;
}

export async function cancelScheduledJob(name: string): Promise<void> {
  const deleted = await db.delete(jobSchedules).where(eq(jobSchedules.name, name)).returning();
  if (deleted.length === 0) throw Boom.notFound(`Schedule not found: ${name}`);
  logger.info({ name }, "Job schedule removed");
}

async function findJob(jobId: string): Promise<Job | undefined> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  return job;
}

function jobNotFound(jobId: string) {
  return Boom.notFound(`Job not found: ${jobId}`, null, "JOB_NOT_FOUND");
}

function actionNotAllowed(action: JobAction, state: JobState) {
  return Boom.badRequest(
    `Cannot ${action} a ${state} job (allowed from: ${JOB_ACTIONS[action].join(", ")})`,
  );
}

/**
 * Apply `set` only while the job is still in a state `action` is allowed
 * from: one compare-and-set UPDATE, so a tick that finishes the job between
 * the caller's read and this write is never overwritten. When no row changes,
 * a follow-up read tells "not found" apart from "wrong state".
 */
async function applyAction(action: JobAction, jobId: string, set: Partial<NewJob>): Promise<void> {
  const changed = await db
    .update(jobs)
    .set(set)
    .where(and(eq(jobs.id, jobId), inArray(jobs.state, [...JOB_ACTIONS[action]])))
    .returning({ id: jobs.id });
  if (changed.length > 0) return;
  const job = await findJob(jobId);
  if (!job) throw jobNotFound(jobId);
  throw actionNotAllowed(action, job.state);
}

export async function deleteJob(jobId: string): Promise<void> {
  const deleted = await db.delete(jobs).where(eq(jobs.id, jobId)).returning({ id: jobs.id });
  if (deleted.length === 0) throw jobNotFound(jobId);
  // An active job's handler may still log; the tick drops those rows when it finishes.
  await deleteJobLogs([jobId]);
}

/** Put a failed or cancelled job back on the queue. */
export async function retryJob(jobId: string): Promise<void> {
  await applyAction("retry", jobId, {
    state: "created",
    runAt: new Date(),
    startedAt: null,
    completedAt: null,
    error: null,
  });
  if (config.jobs.enabled && config.jobs.runInline) {
    waitUntil(runTick({ schedules: false, housekeeping: false }));
  }
}

export async function cancelJob(jobId: string): Promise<void> {
  await applyAction("cancel", jobId, { state: "cancelled", completedAt: new Date() });
}

export async function resumeJob(jobId: string): Promise<void> {
  await applyAction("resume", jobId, { state: "created", runAt: new Date(), completedAt: null });
}

/** Queue a fresh copy of a finished job. Returns the new job's id. */
export async function rerunJob(jobId: string): Promise<string> {
  const job = await findJob(jobId);
  if (!job) throw jobNotFound(jobId);
  if (!canApplyJobAction("rerun", job.state)) throw actionNotAllowed("rerun", job.state);
  return addJob(job.name, job.data, {
    priority: job.priority,
    retryLimit: job.retryLimit,
    retryDelaySeconds: job.retryDelay,
  });
}

export async function rerunJobs(jobIds: string[]): Promise<BulkRerunResult[]> {
  const results = await Promise.allSettled(jobIds.map((jobId) => rerunJob(jobId)));
  return results.map((result, index) => {
    const jobId = jobIds[index]!;
    return result.status === "fulfilled"
      ? { jobId, success: true, newJobId: result.value }
      : {
          jobId,
          success: false,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        };
  });
}
