import { z } from "zod";

const sendOptionsSchema = z
  .object({
    retryLimit: z.coerce.number().int().min(0).optional(),
    retryDelaySeconds: z.coerce.number().int().min(0).optional(),
    priority: z.coerce.number().int().optional(),
    delaySeconds: z.coerce.number().int().min(0).optional(),
    singletonKey: z.string().min(1).optional(),
  })
  .optional();

const scheduleOptionsSchema = z.object({ timezone: z.string().min(1).optional() }).optional();

export const createJobSchema = z.object({
  jobName: z.string().min(1),
  data: z.unknown().optional(),
  options: sendOptionsSchema,
});

export const scheduleJobSchema = z.object({
  jobName: z.string().min(1),
  cron: z.string().min(1),
  data: z.unknown().optional(),
  options: scheduleOptionsSchema,
});

export const bulkRerunSchema = z.object({
  jobIds: z.array(z.string().min(1)).min(1),
});

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const getJobsSchema = paginationQuerySchema.extend({
  state: z.string().optional(),
  name: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const getLogsQuerySchema = z.object({
  afterId: z.coerce.number().int().min(0).optional(),
});
