import { jobsApi } from "./api";
import { JOBS_STALE_TIME, jobsKeys } from "./queries";
import { isTerminalJobState } from "../lifecycle";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

const POLL_INTERVAL_MS = 2000;

/**
 * The job-detail page's data: the job and its logs, fetched together on load
 * and polled while the job can still change state. Polling stops once the job
 * is completed, failed or cancelled; an action that moves it back (retry,
 * resume) invalidates the query and polling resumes.
 */
export function useJobDetail() {
  const { jobId } = useParams<{ jobId: string }>();

  const query = useQuery({
    queryKey: jobsKeys.detail(jobId ?? ""),
    queryFn: async () => {
      if (!jobId) throw new Error("Missing job id");
      const job = await jobsApi.getJob(jobId);
      // Logs after the job: a job seen as finished has flushed all its logs.
      const logs = await jobsApi.getJobLogs(jobId);
      return { job, logs };
    },
    enabled: Boolean(jobId),
    staleTime: JOBS_STALE_TIME,
    refetchInterval: (q) => {
      const job = q.state.data?.job;
      return job && !isTerminalJobState(job.state) ? POLL_INTERVAL_MS : false;
    },
  });

  return {
    job: query.data?.job ?? null,
    logs: query.data?.logs ?? [],
    loading: query.isLoading,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : "Failed to load job"
      : null,
  };
}
