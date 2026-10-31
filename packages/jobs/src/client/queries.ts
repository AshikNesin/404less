import { useQuery } from "@tanstack/react-query";
import { jobsApi } from "./api";

/** React Query keys for the dashboard; every key starts with "jobs". */
export const jobsKeys = {
  all: ["jobs"] as const,
  list: ["jobs", "list"] as const,
  stats: ["jobs", "stats"] as const,
  available: ["jobs", "available"] as const,
  scheduled: ["jobs", "scheduled"] as const,
  detail: (jobId: string) => ["jobs", "detail", jobId] as const,
};

// Operational view: always refetch on revisit/focus rather than serving the
// 5-minute-cached data (overrides the global QueryClient staleTime).
export const JOBS_STALE_TIME = 0;

export function useJobStats() {
  return useQuery({
    queryKey: jobsKeys.stats,
    queryFn: jobsApi.getJobStats,
    staleTime: JOBS_STALE_TIME,
  });
}

/** Job names seen in the queue plus every registered handler. */
export function useAvailableJobs(): string[] {
  const query = useQuery({
    queryKey: jobsKeys.available,
    queryFn: jobsApi.getAvailableJobs,
    staleTime: JOBS_STALE_TIME,
  });
  return query.data ?? [];
}

export function useScheduledJobs() {
  return useQuery({
    queryKey: jobsKeys.scheduled,
    queryFn: jobsApi.getScheduledJobs,
    staleTime: JOBS_STALE_TIME,
  });
}
