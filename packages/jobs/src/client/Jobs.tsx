import { Button } from "@groot/ui/button";
import { PageLayout } from "@groot/shell/components/layout/PageLayout";
import { formatRelativeTime } from "@groot/shell/lib/utils";
import { AddJobDialog } from "./components/AddJobDialog";
import { ScheduleJobDialog } from "./components/ScheduleJobDialog";
import { JobsFilters } from "./components/JobsFilters";
import { JobsStats } from "./components/JobsStats";
import { JobsTable } from "./components/JobsTable";
import { ScheduledJobsPanel } from "./components/ScheduledJobsPanel";
import { jobsKeys } from "./queries";
import { useJobs } from "./useJobs";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

export function Jobs() {
  const j = useJobs();
  const queryClient = useQueryClient();
  const refreshing = useIsFetching({ queryKey: jobsKeys.all }) > 0;
  const refresh = () => {
    void queryClient.refetchQueries({ queryKey: jobsKeys.all, type: "active" });
  };

  const actions = (
    <>
      <Button variant="outline" size="icon" onClick={refresh} disabled={refreshing} title="Refresh">
        <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
      </Button>
      <ScheduleJobDialog />
      <AddJobDialog />
    </>
  );

  const description = j.lastRefreshed
    ? `Updated ${formatRelativeTime(j.lastRefreshed)}${refreshing ? " · refreshing…" : ""}`
    : undefined;

  return (
    <PageLayout title="Jobs" description={description} actions={actions} maxWidth="7xl">
      <JobsStats
        activeState={j.queryParams.state}
        onSelectState={(state) => j.setQueryParams({ state, page: 0 })}
      />

      <JobsFilters
        queryParams={j.queryParams}
        setQueryParams={j.setQueryParams}
        activeSecondaryTab={j.activeSecondaryTab}
        hasActiveFilters={j.hasActiveFilters}
        handlePresetChange={j.handlePresetChange}
        handleClearFilters={j.handleClearFilters}
      />

      <JobsTable
        // Remounting per filter set clears the row selection.
        key={JSON.stringify([
          j.queryParams.state,
          j.queryParams.queue,
          j.queryParams.page,
          j.queryParams.startDate,
          j.queryParams.endDate,
          j.queryParams.search,
        ])}
        jobs={j.jobs}
        loading={j.loading}
        total={j.total}
        error={j.error}
        onErrorRetry={refresh}
        queryParams={j.queryParams}
        setQueryParams={j.setQueryParams}
      />

      <ScheduledJobsPanel />
    </PageLayout>
  );
}
