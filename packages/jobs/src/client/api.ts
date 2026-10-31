import { apiClient } from "@groot/shell/lib/api";
import type {
  AddJobOptions,
  BulkRerunResult,
  Job,
  JobLog,
  JobName,
  JobSchedule,
  JobStats,
  ScheduleJobOptions,
} from "./types";

/**
 * Jobs API client. Thin typed wrappers over the shared `apiClient` — the
 * envelope unwrapping and 401 handling live in one place (@groot/shell/lib/api).
 */
export const jobsApi = {
  async getJobStats(): Promise<JobStats> {
    return apiClient.get<JobStats>("/jobs/stats");
  },

  async getJobs(options?: {
    state?: string;
    name?: string;
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<{ jobs: Job[]; total: number }> {
    return apiClient.get<{ jobs: Job[]; total: number }>("/jobs", options);
  },

  async getJob(jobId: string): Promise<Job> {
    return apiClient.get<Job>(`/jobs/${jobId}`);
  },

  async getJobLogs(jobId: string, afterId?: number): Promise<JobLog[]> {
    return apiClient.get<JobLog[]>(`/jobs/${jobId}/logs`, afterId ? { afterId } : undefined);
  },

  async retryJob(jobId: string): Promise<void> {
    await apiClient.post(`/jobs/${jobId}/retry`);
  },

  async cancelJob(jobId: string): Promise<void> {
    await apiClient.post(`/jobs/${jobId}/cancel`);
  },

  async resumeJob(jobId: string): Promise<void> {
    await apiClient.post(`/jobs/${jobId}/resume`);
  },

  async deleteJob(jobId: string): Promise<void> {
    await apiClient.delete(`/jobs/${jobId}`);
  },

  async rerunJob(jobId: string): Promise<{ newJobId: string }> {
    return apiClient.post<{ newJobId: string }>(`/jobs/${jobId}/rerun`);
  },

  async rerunJobs(jobIds: string[]): Promise<BulkRerunResult[]> {
    return apiClient.post<BulkRerunResult[]>("/jobs/bulk-rerun", { jobIds });
  },

  async purgeJobsByState(state: string): Promise<{ deletedCount: number }> {
    const result = await apiClient.delete<{ count: number }>(`/jobs/state/${state}`);
    return { deletedCount: result.count };
  },

  async addJob(
    jobName: JobName,
    data: Record<string, unknown>,
    options?: AddJobOptions,
  ): Promise<string> {
    const result = await apiClient.post<{ jobId: string }>("/jobs", { jobName, data, options });
    return result.jobId;
  },

  async getAvailableJobs(): Promise<string[]> {
    const result = await apiClient.get<{ jobs: string[] }>("/jobs/available");
    return result.jobs;
  },

  async getScheduledJobs(): Promise<JobSchedule[]> {
    return apiClient.get<JobSchedule[]>("/jobs/schedule");
  },

  /** Create or replace the schedule for `jobName` (one per name). */
  async scheduleJob(
    jobName: JobName,
    cron: string,
    data: Record<string, unknown>,
    options?: ScheduleJobOptions,
  ): Promise<JobSchedule> {
    return apiClient.post<JobSchedule>("/jobs/schedule", { jobName, data, cron, options });
  },

  /** Schedules are keyed by job name — one per name — so this removes that name's schedule. */
  async cancelScheduledJob(jobName: string): Promise<void> {
    await apiClient.delete(`/jobs/schedule/${encodeURIComponent(jobName)}`);
  },
};
