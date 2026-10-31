import { jobsApi } from "./api";
import { endOfDay, startOfDay, startOfMonth, subtractDays } from "@groot/shell/lib/utils";
import type { Job } from "./types";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { JOBS_PAGE_SIZE, secondaryOptions } from "./constants";
import { JOBS_STALE_TIME, jobsKeys } from "./queries";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

/**
 * The jobs list: URL-synced filters and the page of jobs they select. Row
 * selection lives in `JobsTable`; stats, schedules and the dialogs load and
 * mutate on their own.
 */
export function useJobs() {
  const [queryParams, setQueryParams] = useQueryStates({
    state: parseAsString.withDefault("all"),
    queue: parseAsString.withDefault("all"),
    search: parseAsString.withDefault(""),
    page: parseAsInteger.withDefault(0),
    startDate: parseAsString,
    endDate: parseAsString,
    datePreset: parseAsString.withDefault("all"),
  });

  const jobsQuery = useQuery({
    queryKey: [
      ...jobsKeys.list,
      queryParams.state,
      queryParams.queue,
      queryParams.page,
      queryParams.startDate ?? null,
      queryParams.endDate ?? null,
    ],
    queryFn: () => {
      const filters: {
        state?: string;
        name?: string;
        limit: number;
        offset: number;
        startDate?: string;
        endDate?: string;
      } = { limit: JOBS_PAGE_SIZE, offset: queryParams.page * JOBS_PAGE_SIZE };
      if (queryParams.state !== "all") filters.state = queryParams.state;
      if (queryParams.queue !== "all") filters.name = queryParams.queue;
      if (queryParams.startDate) filters.startDate = queryParams.startDate;
      if (queryParams.endDate) filters.endDate = queryParams.endDate;
      return jobsApi.getJobs(filters);
    },
    placeholderData: keepPreviousData,
    staleTime: JOBS_STALE_TIME,
  });

  // Derived view (search is a client-side filter on the fetched page)
  const fetchedJobs = jobsQuery.data?.jobs ?? [];
  const jobs: Job[] = queryParams.search.trim()
    ? fetchedJobs.filter((job) => {
        const q = queryParams.search.toLowerCase().trim();
        return job.id.toLowerCase().includes(q) || job.name.toLowerCase().includes(q);
      })
    : fetchedJobs;
  const total = queryParams.search.trim() ? jobs.length : (jobsQuery.data?.total ?? 0);

  const handlePresetChange = (value: string) => {
    const now = new Date();
    let start: Date | undefined;
    let end: Date | undefined = endOfDay(now);

    switch (value) {
      case "today":
        start = startOfDay(now);
        break;
      case "last-7-days":
        start = startOfDay(subtractDays(now, 6));
        break;
      case "this-month":
        start = startOfMonth(now);
        break;
      default:
        start = undefined;
        end = undefined;
    }

    setQueryParams({
      datePreset: value,
      startDate: start ? start.toISOString() : null,
      endDate: end ? end.toISOString() : null,
      page: 0,
    });
  };

  const handleClearFilters = () => {
    setQueryParams({
      state: "all",
      queue: "all",
      search: "",
      page: 0,
      startDate: null,
      endDate: null,
      datePreset: "all",
    });
  };

  const hasActiveFilters =
    queryParams.state !== "all" ||
    queryParams.queue !== "all" ||
    queryParams.search.trim() !== "" ||
    queryParams.datePreset !== "all";

  const activeSecondaryTab = secondaryOptions.find((t) => t.value === queryParams.state);

  return {
    queryParams,
    setQueryParams,
    jobs,
    total,
    loading: jobsQuery.isLoading,
    error: jobsQuery.error
      ? jobsQuery.error instanceof Error
        ? jobsQuery.error.message
        : "Failed to load jobs"
      : null,
    lastRefreshed: jobsQuery.dataUpdatedAt ? new Date(jobsQuery.dataUpdatedAt) : null,
    activeSecondaryTab,
    hasActiveFilters,
    handlePresetChange,
    handleClearFilters,
  };
}
