import { Button } from "@groot/ui/button";
import { listRowGridClass } from "@groot/ui/list-row";
import { Card } from "@groot/ui/card";
import { cn } from "@groot/ui/lib/utils";
import { tableColumnHeaderClass } from "@groot/ui/table";
import { useConfirm } from "@groot/ui/primitives";
import { Section } from "@groot/shell/components/layout/Section";
import { jobsApi } from "@groot/jobs/client/api";
import { jobsKeys, useScheduledJobs } from "@groot/jobs/client/queries";
import type { JobSchedule } from "@groot/jobs/client/types";
import { withJobToast } from "@groot/jobs/client/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { ScheduleJobDialog } from "./ScheduleJobDialog";
import { ScheduledJobsSkeleton } from "./skeletons";

function EditScheduleButton({
  schedule,
  className,
}: {
  schedule: JobSchedule;
  className?: string;
}) {
  return (
    <ScheduleJobDialog
      schedule={schedule}
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          className={className}
          title="Edit schedule"
          aria-label={`Edit schedule ${schedule.name}`}
        >
          <Pencil className="size-3.5" />
        </Button>
      }
    />
  );
}

/** Scheduled (cron) jobs: desktop grid + mobile cards, with edit/cancel actions. */
export function ScheduledJobsPanel() {
  const { data: scheduledJobs = [], isLoading } = useScheduledJobs();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const cancelSchedule = async (jobName: string) => {
    const confirmed = await confirm({
      title: `Cancel scheduled job "${jobName}"?`,
      description: "The schedule will stop running; already-queued jobs are unaffected.",
      confirmLabel: "Cancel schedule",
      destructive: true,
    });
    if (!confirmed) return;
    return withJobToast(
      () => jobsApi.cancelScheduledJob(jobName),
      () => "Scheduled job has been cancelled",
      "Failed to cancel scheduled job",
      () => void queryClient.invalidateQueries({ queryKey: jobsKeys.scheduled }),
    );
  };

  if (isLoading) {
    return <ScheduledJobsSkeleton />;
  }

  if (scheduledJobs.length === 0) return null;

  return (
    <Section title="Scheduled jobs" meta={`${scheduledJobs.length} total`}>
      <Card className="gap-0 overflow-hidden p-0">
        <div className="hidden md:block">
          <div className="grid grid-cols-12 gap-4 border-b border-border/60 px-4 py-2.5">
            <div className={cn(tableColumnHeaderClass, "col-span-3")}>Job name</div>
            <div className={cn(tableColumnHeaderClass, "col-span-3")}>Schedule</div>
            <div className={cn(tableColumnHeaderClass, "col-span-2")}>Timezone</div>
            <div className={cn(tableColumnHeaderClass, "col-span-3")}>Data</div>
            <div className="col-span-1" />
          </div>
          <div className="divide-y divide-border/40">
            {scheduledJobs.map((job) => (
              <div key={job.name} className={cn(listRowGridClass, "group")}>
                <div className="col-span-3 font-medium text-foreground">{job.name}</div>
                <div className="col-span-3 font-mono text-xs text-muted-foreground">{job.cron}</div>
                <div className="col-span-2 text-muted-foreground">
                  {job.timezone || "Server time"}
                </div>
                <div className="col-span-3">
                  <pre className="font-mono text-[11px] bg-muted px-1.5 py-1 rounded-md truncate max-w-xs">
                    {JSON.stringify(job.data)}
                  </pre>
                </div>
                <div className="col-span-1 flex justify-end gap-0.5">
                  <EditScheduleButton
                    schedule={job}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void cancelSchedule(job.name)}
                    className="text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                    title="Cancel schedule"
                    aria-label={`Cancel schedule ${job.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Mobile scheduled cards */}
        <div className="md:hidden divide-y divide-border/40">
          {scheduledJobs.map((job) => (
            <div key={job.name} className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{job.name}</span>
                <div className="flex gap-0.5">
                  <EditScheduleButton schedule={job} />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void cancelSchedule(job.name)}
                    className="text-destructive hover:text-destructive"
                    title="Cancel schedule"
                    aria-label={`Cancel schedule ${job.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
              <div className="text-xs space-y-1">
                <div>
                  <span className="text-muted-foreground">Schedule: </span>
                  <span className="font-mono">{job.cron}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Data: </span>
                  <span className="font-mono text-[11px]">{JSON.stringify(job.data)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </Section>
  );
}
