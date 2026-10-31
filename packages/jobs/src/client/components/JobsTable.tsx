import { Button } from "@groot/ui/button";
import { Card } from "@groot/ui/card";
import { Checkbox } from "@groot/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@groot/ui/dropdown-menu";
import { EmptyState, ErrorState } from "@groot/ui/empty-state";
import { tableColumnHeaderClass } from "@groot/ui/table";
import { listRowGridClass } from "@groot/ui/list-row";
import { StatusBadge } from "@groot/ui";
import { cn } from "@groot/ui/lib/utils";
import { Section } from "@groot/shell/components/layout/Section";
import { formatLocaleDateTime, formatRelativeTime } from "@groot/shell/lib/utils";
import { formatJobId } from "@groot/jobs/client/utils";
import type { Job, JobAction } from "@groot/jobs/client/types";
import {
  JOB_ACTION_UI,
  JOBS_PAGE_SIZE,
  stateLabel,
  type JobsQueryPatch,
} from "@groot/jobs/client/constants";
import { useJobActions } from "@groot/jobs/client/useJobActions";
import { allowedJobActions } from "../../lifecycle";
import { JobsTableSkeleton } from "./skeletons";
import { ChevronRight, FileText, MoreVertical, Play, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

/** One grid for the header and every row: job · status · menu on mobile, 12 columns from md. */
const ROW_GRID = "grid-cols-[minmax(0,1fr)_auto_auto] md:grid-cols-12";

type Props = {
  jobs: Job[];
  loading: boolean;
  total: number;
  error?: string | null;
  onErrorRetry?: () => void;
  queryParams: { state: string; page: number };
  setQueryParams: (patch: JobsQueryPatch) => void;
};

/**
 * The jobs list: one accessible table (rows named "Job <name> (<short id>)"),
 * row selection by job id with a bulk re-run, purge-by-state, and pagination.
 * Selection only counts rows on the current page; mount it with a key per
 * filter set to clear it when the filters change.
 */
export function JobsTable({
  jobs,
  loading,
  total,
  error,
  onErrorRetry,
  queryParams,
  setQueryParams,
}: Props) {
  const { run, rerunMany, purge } = useJobActions();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const selectedIds = jobs.filter((job) => selected.has(job.id)).map((job) => job.id);
  const allSelected = jobs.length > 0 && selectedIds.length === jobs.length;

  const toggle = (jobId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(jobId)) next.add(jobId);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(jobs.map((job) => job.id)));
  const rerunSelected = async () => {
    if (await rerunMany(selectedIds)) setSelected(new Set());
  };

  const sectionActions = (
    <>
      {selectedIds.length > 0 && (
        <Button variant="outline" size="sm" onClick={() => void rerunSelected()}>
          <Play className="size-3.5" />
          Rerun {selectedIds.length}
        </Button>
      )}
      {queryParams.state !== "all" && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void purge(queryParams.state)}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
          Purge {stateLabel(queryParams.state)}
        </Button>
      )}
    </>
  );

  return (
    <Section
      title={queryParams.state === "all" ? "All jobs" : `${stateLabel(queryParams.state)} jobs`}
      meta={`${jobs.length} of ${total}`}
      actions={sectionActions}
    >
      <div className="space-y-3">
        <Card className="gap-0 overflow-hidden p-0">
          {error && jobs.length === 0 ? (
            <ErrorState
              title="Couldn't load jobs"
              description={error}
              action={
                onErrorRetry && (
                  <Button variant="outline" size="sm" onClick={onErrorRetry}>
                    <RefreshCw className="size-3.5" />
                    Retry
                  </Button>
                )
              }
            />
          ) : loading && jobs.length === 0 ? (
            <JobsTableSkeleton />
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No jobs found"
              description={
                queryParams.state !== "all"
                  ? `No ${stateLabel(queryParams.state).toLowerCase()} jobs`
                  : "The queue is empty"
              }
            />
          ) : (
            <div role="table" aria-label="Jobs">
              <div role="rowgroup" className="border-b border-border/60">
                <div role="row" className={cn("grid items-center gap-4 px-4 py-2.5", ROW_GRID)}>
                  <div
                    role="columnheader"
                    className={cn(tableColumnHeaderClass, "flex items-center gap-3 md:col-span-5")}
                  >
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                      className="size-3.5"
                    />
                    <span>Job</span>
                  </div>
                  <div role="columnheader" className={cn(tableColumnHeaderClass, "md:col-span-2")}>
                    Status
                  </div>
                  <div
                    role="columnheader"
                    className={cn(tableColumnHeaderClass, "hidden md:col-span-2 md:block")}
                  >
                    Created
                  </div>
                  <div
                    role="columnheader"
                    className={cn(tableColumnHeaderClass, "hidden md:col-span-2 md:block")}
                  >
                    Started
                  </div>
                  <div role="columnheader" className="md:col-span-1">
                    <span className="sr-only">Actions</span>
                  </div>
                </div>
              </div>
              <div role="rowgroup" className="divide-y divide-border/40">
                {jobs.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    selected={selected.has(job.id)}
                    onToggle={() => toggle(job.id)}
                    onAction={(action) => void run(action, job)}
                  />
                ))}
              </div>
            </div>
          )}
        </Card>

        {total > JOBS_PAGE_SIZE && (
          <div className="flex justify-between items-center">
            <div className="text-xs text-muted-foreground">
              Page {queryParams.page + 1} of {Math.ceil(total / JOBS_PAGE_SIZE)}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQueryParams({ page: Math.max(0, queryParams.page - 1) })}
                disabled={queryParams.page === 0}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQueryParams({ page: queryParams.page + 1 })}
                disabled={(queryParams.page + 1) * JOBS_PAGE_SIZE >= total}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

function JobRow({
  job,
  selected,
  onToggle,
  onAction,
}: {
  job: Job;
  selected: boolean;
  onToggle: () => void;
  onAction: (action: JobAction) => void;
}) {
  const label = `${job.name} (${formatJobId(job.id)})`;
  const created = formatRelativeTime(job.createdAt);
  return (
    <div
      role="row"
      aria-label={`Job ${label}`}
      className={cn("group relative", listRowGridClass, ROW_GRID)}
    >
      <div role="cell" className="flex min-w-0 items-center gap-3 md:col-span-5">
        {/* Full-row navigation link; the checkbox and the menu sit above it (z-10). */}
        <Link
          to={`/jobs/${job.id}`}
          className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          aria-label={`View details for job ${label}`}
        />
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select job ${label}`}
          className="relative z-10 size-3.5"
        />
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{job.name}</div>
          <div className="truncate font-mono text-xs text-muted-foreground">
            {formatJobId(job.id)}
            <span className="font-sans md:hidden"> · {created}</span>
          </div>
        </div>
      </div>
      <div role="cell" className="md:col-span-2">
        <StatusBadge status={job.state} />
      </div>
      <div
        role="cell"
        className="hidden text-muted-foreground md:col-span-2 md:block"
        title={formatLocaleDateTime(job.createdAt)}
      >
        {created}
      </div>
      <div
        role="cell"
        className="hidden text-muted-foreground md:col-span-2 md:block"
        title={job.startedAt ? formatLocaleDateTime(job.startedAt) : "N/A"}
      >
        {job.startedAt ? formatRelativeTime(job.startedAt) : "—"}
      </div>
      <div role="cell" className="flex items-center justify-end gap-2 md:col-span-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for job ${label}`}
              className="relative z-10 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100"
            >
              <MoreVertical className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {allowedJobActions(job.state).map((action) => {
              const { label: actionLabel, icon: Icon, destructive } = JOB_ACTION_UI[action];
              return (
                <DropdownMenuItem
                  key={action}
                  onClick={() => onAction(action)}
                  className={destructive ? "text-destructive focus:text-destructive" : undefined}
                >
                  <Icon className="size-3.5" />
                  {actionLabel}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <ChevronRight className="hidden size-4 text-muted-foreground md:block" />
      </div>
    </div>
  );
}
