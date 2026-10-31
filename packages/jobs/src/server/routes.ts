import { Hono } from "hono";
import type { AppEnv } from "@groot/core/types";
import { Boom } from "@groot/core/errors";
import { ok } from "@groot/core/utils/api-response.utils";
import { parseBody, parseQuery, parseStringParam } from "@groot/core/utils/controller.utils";
import * as queue from "./queue";
import * as queries from "./queries";
import {
  bulkRerunSchema,
  createJobSchema,
  getJobsSchema,
  getLogsQuerySchema,
  scheduleJobSchema,
} from "./validation";

/** Admin API behind JWT: `/api/v1/jobs`. */
export const jobRoutes = new Hono<AppEnv>();

jobRoutes.post("/", async (c) => {
  const { jobName, data, options } = await parseBody(c, createJobSchema);
  const jobId = await queue.addJob(jobName, data, options);
  return ok(c, { jobId, jobName, data }, 201);
});

jobRoutes.post("/bulk-rerun", async (c) => {
  const { jobIds } = await parseBody(c, bulkRerunSchema);
  return ok(c, await queue.rerunJobs(jobIds));
});

// Schedules
jobRoutes.get("/schedule", async (c) => ok(c, await queries.getScheduledJobs()));

jobRoutes.post("/schedule", async (c) => {
  const { jobName, data, cron, options } = await parseBody(c, scheduleJobSchema);
  return ok(c, await queue.scheduleJob(jobName, data, cron, options), 201);
});

jobRoutes.delete("/schedule/:jobName", async (c) => {
  const jobName = parseStringParam(c.req.param("jobName"), "jobName");
  await queue.cancelScheduledJob(jobName);
  return ok(c, { success: true });
});

// Dashboard
jobRoutes.get("/stats", async (c) => ok(c, await queries.getQueueStats()));

jobRoutes.get("/available", async (c) => ok(c, { jobs: await queries.getAvailableQueues() }));

jobRoutes.delete("/state/:state", async (c) => {
  const state = parseStringParam(c.req.param("state"), "state");
  return ok(c, { count: await queries.purgeJobsByState({ state }) });
});

jobRoutes.get("/", async (c) => ok(c, await queries.getJobs(parseQuery(c, getJobsSchema))));

// Single job (`:jobId` is the uuid primary key)
const jobIdParam = (c: { req: { param(name: string): string | undefined } }) =>
  parseStringParam(c.req.param("jobId"), "jobId");

jobRoutes.get("/:jobId", async (c) => {
  const job = await queries.getJobById(jobIdParam(c));
  if (!job) throw Boom.notFound("Job not found", null, "JOB_NOT_FOUND");
  return ok(c, job);
});

jobRoutes.get("/:jobId/logs", async (c) => {
  const { afterId } = parseQuery(c, getLogsQuerySchema);
  return ok(c, await queries.getJobLogs({ jobId: jobIdParam(c), afterId }));
});

jobRoutes.delete("/:jobId", async (c) => {
  await queue.deleteJob(jobIdParam(c));
  return ok(c, { success: true });
});

jobRoutes.post("/:jobId/retry", async (c) => {
  await queue.retryJob(jobIdParam(c));
  return ok(c, { success: true });
});

jobRoutes.post("/:jobId/cancel", async (c) => {
  await queue.cancelJob(jobIdParam(c));
  return ok(c, { success: true });
});

jobRoutes.post("/:jobId/resume", async (c) => {
  await queue.resumeJob(jobIdParam(c));
  return ok(c, { success: true });
});

jobRoutes.post("/:jobId/rerun", async (c) => {
  return ok(c, { newJobId: await queue.rerunJob(jobIdParam(c)) });
});
