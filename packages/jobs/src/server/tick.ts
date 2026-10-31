import { and, asc, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { Cron } from "croner";
import { db, kv } from "@groot/core/database";
import { config } from "@groot/core/config";
import { logger, logPerformance } from "@groot/core/logger";
import { reportError } from "@groot/core/errors";
import { purgeExpiredKv } from "@groot/core/kv";
import { jobs, jobSchedules, type Job, type NewJob } from "./schema";
import { createJobLogger, deleteJobLogs, flushJobLogs } from "./logger";
import { getJobHandler, getRegisteredHandlers } from "./worker";
import type { TickOptions, TickResult } from "./types";

/**
 * One pass over the queue: enqueue due schedules, recover crashed jobs, claim a
 * batch, run it, clean up. Called by the Node poller every few seconds, by the
 * Workers cron trigger every minute, and right after `addJob()` for low latency.
 */

const HOUSEKEEPING_INTERVAL_MS = 10 * 60 * 1000;
/** How long to wait before asking again after another process held the slot. */
const HOUSEKEEPING_RECHECK_MS = 60 * 1000;
const HOUSEKEEPING_KEY = "jobs:housekeeping:lastRunAt";
const MAX_RETRY_DELAY_MS = 24 * 60 * 60 * 1000;

let inFlight: Promise<TickResult> | null = null;
let rerunRequested = false;
let nextHousekeepingCheck = 0;

export function runTick(options: TickOptions = {}): Promise<TickResult> {
  if (inFlight) {
    // Another tick is running; make sure one more follows it so a job added
    // mid-tick is not left waiting for the next poll.
    rerunRequested = true;
    return inFlight;
  }
  inFlight = tick(options)
    .catch((error: unknown) => {
      logger.error({ err: error }, "Job tick failed");
      reportError(error, { component: "jobs" });
      return emptyResult();
    })
    .finally(() => {
      inFlight = null;
      if (rerunRequested) {
        rerunRequested = false;
        void runTick({ schedules: false, housekeeping: false });
      }
    });
  return inFlight;
}

/** Resolves when no tick is running. */
export async function tickInFlight(): Promise<void> {
  while (inFlight) await inFlight;
}

function emptyResult(): TickResult {
  return { scheduled: 0, claimed: 0, completed: 0, retried: 0, failed: 0 };
}

async function tick(options: TickOptions): Promise<TickResult> {
  const result = emptyResult();
  const now = new Date();

  if (options.schedules ?? true) result.scheduled = await materializeSchedules(now);
  await recoverStuckJobs(now);

  const claimed = await claimJobs(now, options.limit ?? config.jobs.batchSize);
  result.claimed = claimed.length;
  for (const job of claimed) {
    const outcome = await runJob(job);
    result[outcome] += 1;
  }

  if ((options.housekeeping ?? true) && (await claimHousekeeping(now))) {
    await housekeeping(now);
  }

  return result;
}

/**
 * True when this tick owns the housekeeping slot. The last run time lives in a
 * kv row, claimed with one compare-and-set upsert, because a Workers isolate
 * starts with empty module state and an in-memory timer alone would let every
 * fresh isolate sweep again. The in-memory check spares the Node poller a
 * query on every tick.
 */
async function claimHousekeeping(now: Date): Promise<boolean> {
  const nowMs = now.getTime();
  if (nowMs < nextHousekeepingCheck) return false;

  const value = JSON.stringify(nowMs);
  const claimed = await db
    .insert(kv)
    .values({ key: HOUSEKEEPING_KEY, value })
    .onConflictDoUpdate({
      target: kv.key,
      set: { value },
      setWhere: sql`CAST(${kv.value} AS INTEGER) <= ${nowMs - HOUSEKEEPING_INTERVAL_MS}`,
    })
    .returning({ key: kv.key });

  const owned = claimed.length > 0;
  nextHousekeepingCheck = nowMs + (owned ? HOUSEKEEPING_INTERVAL_MS : HOUSEKEEPING_RECHECK_MS);
  return owned;
}

/** Next fire time of a cron expression after `from`, or null when it never fires. */
export function nextCronRun(cron: string, from: Date, timezone?: string | null): Date | null {
  return new Cron(cron, { timezone: timezone ?? undefined }).nextRun(from);
}

async function materializeSchedules(now: Date): Promise<number> {
  const schedules = await db.select().from(jobSchedules);
  let enqueued = 0;

  for (const schedule of schedules) {
    const next = nextCronRun(
      schedule.cron,
      schedule.lastRunAt ?? schedule.createdAt,
      schedule.timezone,
    );
    if (!next || next.getTime() > now.getTime()) continue;

    // Compare-and-set so two concurrent ticks never enqueue the same fire.
    const claimed = await db
      .update(jobSchedules)
      .set({ lastRunAt: now })
      .where(
        and(
          eq(jobSchedules.name, schedule.name),
          schedule.lastRunAt
            ? eq(jobSchedules.lastRunAt, schedule.lastRunAt)
            : sql`${jobSchedules.lastRunAt} IS NULL`,
        ),
      )
      .returning({ name: jobSchedules.name });
    if (claimed.length === 0) continue;

    await db.insert(jobs).values({
      id: crypto.randomUUID(),
      name: schedule.name,
      data: schedule.data ?? null,
      state: "created",
      retryLimit: config.jobs.retryLimit,
      retryDelay: config.jobs.retryDelaySeconds,
      runAt: now,
    });
    enqueued += 1;
  }

  return enqueued;
}

/** Jobs stuck in `active` past the timeout (a crashed process) are retried or failed. */
async function recoverStuckJobs(now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - config.jobs.activeTimeoutSeconds * 1000);
  const stuck = and(eq(jobs.state, "active"), lt(jobs.startedAt, cutoff));

  await db
    .update(jobs)
    .set({ state: "failed", completedAt: now, error: "Timed out while active" })
    .where(and(stuck, sql`${jobs.retryCount} >= ${jobs.retryLimit}`));

  await db
    .update(jobs)
    .set({
      state: "created",
      startedAt: null,
      runAt: now,
      retryCount: sql`${jobs.retryCount} + 1`,
      error: "Timed out while active",
    })
    .where(stuck);
}

/** Atomically move up to `limit` due jobs (with a registered handler) to `active`. */
async function claimJobs(now: Date, limit: number): Promise<Job[]> {
  const names = getRegisteredHandlers();
  if (names.length === 0 || limit <= 0) return [];

  const due = db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.state, "created"), lte(jobs.runAt, now), inArray(jobs.name, names)))
    .orderBy(desc(jobs.priority), asc(jobs.runAt), asc(jobs.createdAt))
    .limit(limit);

  const claimed = await db
    .update(jobs)
    .set({ state: "active", startedAt: now })
    .where(and(eq(jobs.state, "created"), inArray(jobs.id, due)))
    .returning();

  // RETURNING does not preserve the subquery's ORDER BY; run high priority first.
  return claimed.sort(
    (a, b) =>
      b.priority - a.priority ||
      a.runAt.getTime() - b.runAt.getTime() ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

function serializable(value: unknown): unknown {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

/**
 * Record the outcome while the job is still `active` (a cancel or delete that
 * landed mid-run wins). A job deleted mid-run has no row left to own the logs
 * its handler wrote after the delete, so they go too.
 */
async function finishJob(job: Job, set: Partial<NewJob>): Promise<void> {
  const updated = await db
    .update(jobs)
    .set(set)
    .where(and(eq(jobs.id, job.id), eq(jobs.state, "active")))
    .returning({ id: jobs.id });
  if (updated.length > 0) return;
  const [exists] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, job.id)).limit(1);
  if (!exists) await deleteJobLogs([job.id]);
}

async function runJob(job: Job): Promise<"completed" | "retried" | "failed"> {
  const jobLogger = createJobLogger({ jobId: job.id, jobName: job.name });
  const handler = getJobHandler(job.name);
  const startTime = Date.now();
  const attempt = job.retryCount + 1;

  if (!handler) {
    await finishJob(job, {
      state: "failed",
      completedAt: new Date(),
      error: "No handler registered",
    });
    return "failed";
  }

  jobLogger.info({ data: job.data, attempt }, `Starting job ${job.name}`);
  try {
    const output = await handler({
      id: job.id,
      name: job.name,
      data: job.data,
      attempt,
      logger: jobLogger,
    });
    const duration = Date.now() - startTime;
    jobLogger.info({ duration: `${duration}ms` }, `Job ${job.name} completed`);
    logPerformance({ operation: `job_${job.name}`, duration, data: { jobId: job.id } });
    await flushJobLogs();
    await finishJob(job, {
      state: "completed",
      completedAt: new Date(),
      output: serializable(output),
      error: null,
    });
    return "completed";
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    jobLogger.error({ err: error, duration: `${duration}ms`, attempt }, `Job ${job.name} failed`);
    logPerformance({
      operation: `job_${job.name}`,
      duration,
      data: { jobId: job.id, failed: true },
    });
    reportError(error, { component: "jobs", jobName: job.name, jobId: job.id, attempt });
    await flushJobLogs();

    if (job.retryCount < job.retryLimit) {
      const delayMs = Math.min(job.retryDelay * 1000 * 2 ** job.retryCount, MAX_RETRY_DELAY_MS);
      await finishJob(job, {
        state: "created",
        startedAt: null,
        runAt: new Date(Date.now() + delayMs),
        retryCount: job.retryCount + 1,
        error: message,
      });
      return "retried";
    }

    await finishJob(job, { state: "failed", completedAt: new Date(), error: message });
    return "failed";
  }
}

/**
 * Delete old finished jobs with their logs, and expired kv entries. Every
 * statement uses an index, so the cost follows what is deleted, not table size.
 */
export async function housekeeping(now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - config.jobs.keepCompletedDays * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(jobs)
    .where(and(inArray(jobs.state, ["completed", "cancelled"]), lt(jobs.completedAt, cutoff)))
    .returning({ id: jobs.id });
  await deleteJobLogs(deleted.map((job) => job.id));
  await purgeExpiredKv();
}
