import { and, asc, count, desc, eq, gt, gte, lte } from "drizzle-orm";
import { db } from "@groot/core/database";
import { Boom } from "@groot/core/errors";
import { JOB_STATES, VALID_JOB_STATES, isValidJobState, type JobState } from "../lifecycle";
import { jobs, jobLogs, jobSchedules, type Job, type JobLog, type JobSchedule } from "./schema";
import { deleteJobLogs } from "./logger";
import { getRegisteredHandlers } from "./worker";
import type { GetJobsOptions, JobQueryResponse, JobStats } from "./types";

function assertState(state: string): JobState {
  if (!isValidJobState(state)) {
    throw Boom.badRequest(
      `Invalid job state: ${state}. Valid states: ${VALID_JOB_STATES.join(", ")}`,
    );
  }
  return state;
}

export async function getJobById(jobId: string): Promise<Job | null> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  return job ?? null;
}

export async function getQueueStats(): Promise<JobStats> {
  const rows = await db
    .select({ state: jobs.state, total: count() })
    .from(jobs)
    .groupBy(jobs.state);
  const stats = Object.fromEntries(Object.values(JOB_STATES).map((s) => [s, 0])) as JobStats;
  for (const row of rows) stats[row.state] = row.total;
  return stats;
}

/** Job names seen in the queue plus every registered handler. */
export async function getAvailableQueues(): Promise<string[]> {
  const rows = await db.selectDistinct({ name: jobs.name }).from(jobs);
  return [...new Set([...rows.map((r) => r.name), ...getRegisteredHandlers()])].sort();
}

export async function getJobs(options: GetJobsOptions = {}): Promise<JobQueryResponse> {
  const { state, name, startDate, endDate, limit = 50, offset = 0 } = options;
  const filters = [];
  if (state) filters.push(eq(jobs.state, assertState(state)));
  if (name) filters.push(eq(jobs.name, name));
  if (startDate) {
    const from = new Date(startDate);
    if (Number.isNaN(from.getTime())) throw Boom.badRequest(`Invalid startDate: ${startDate}`);
    filters.push(gte(jobs.createdAt, from));
  }
  if (endDate) {
    const to = new Date(endDate);
    if (Number.isNaN(to.getTime())) throw Boom.badRequest(`Invalid endDate: ${endDate}`);
    filters.push(lte(jobs.createdAt, to));
  }
  const where = filters.length ? and(...filters) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(jobs).where(where).orderBy(desc(jobs.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(jobs).where(where),
  ]);
  return { jobs: rows, total: total! };
}

export async function purgeJobsByState(options: { state: string }): Promise<number> {
  const state = assertState(options.state);
  const deleted = await db.delete(jobs).where(eq(jobs.state, state)).returning({ id: jobs.id });
  await deleteJobLogs(deleted.map((job) => job.id));
  return deleted.length;
}

export async function getScheduledJobs(): Promise<JobSchedule[]> {
  return db.select().from(jobSchedules).orderBy(asc(jobSchedules.name));
}

export async function getJobLogs(options: { jobId: string; afterId?: number }): Promise<JobLog[]> {
  const filters = [eq(jobLogs.jobId, options.jobId)];
  if (options.afterId) filters.push(gt(jobLogs.id, options.afterId));
  return db
    .select()
    .from(jobLogs)
    .where(and(...filters))
    .orderBy(asc(jobLogs.id));
}
