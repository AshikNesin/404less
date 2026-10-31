import { jobsApi } from "./api";
import { stateLabel } from "./constants";
import { jobsKeys } from "./queries";
import { formatJobId, withJobToast } from "./utils";
import type { Job, JobAction } from "./types";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useConfirm } from "@groot/ui/primitives";

type JobRef = Pick<Job, "id" | "name">;

const STATE_CHANGES = {
  retry: { call: jobsApi.retryJob, success: "Job has been queued for retry" },
  resume: { call: jobsApi.resumeJob, success: "Job has been resumed" },
  cancel: { call: jobsApi.cancelJob, success: "Job has been cancelled" },
} satisfies Partial<Record<JobAction, unknown>>;

/**
 * Runs job actions with the dashboard's standard behaviour: destructive and
 * bulk actions ask for confirmation, every action toasts its outcome, and the
 * list, the stats and the affected detail query refetch afterwards.
 */
export function useJobActions({ onDeleted }: { onDeleted?: () => void } = {}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const refreshLists = () => {
    void queryClient.invalidateQueries({ queryKey: jobsKeys.list });
    void queryClient.invalidateQueries({ queryKey: jobsKeys.stats });
  };

  /** Apply one lifecycle action to one job. */
  const run = async (action: JobAction, job: JobRef): Promise<void> => {
    if (action === "rerun") {
      return withJobToast(
        () => jobsApi.rerunJob(job.id),
        (result) => (
          <span>
            Job re-run created.{" "}
            <Link
              to={`/jobs/${result.newJobId}`}
              className="underline font-medium hover:text-foreground"
            >
              View new job ({formatJobId(result.newJobId)})
            </Link>
          </span>
        ),
        "Failed to re-run job",
        refreshLists,
      );
    }

    if (action === "delete") {
      const confirmed = await confirm({
        title: `Delete job ${job.name} (${formatJobId(job.id)})?`,
        description: "This permanently deletes the job and cannot be undone.",
        confirmLabel: "Delete",
        destructive: true,
      });
      if (!confirmed) return;
      return withJobToast(
        () => jobsApi.deleteJob(job.id),
        () => "Job has been deleted",
        "Failed to delete job",
        () => {
          onDeleted?.();
          queryClient.removeQueries({ queryKey: jobsKeys.detail(job.id) });
          refreshLists();
        },
      );
    }

    const { call, success } = STATE_CHANGES[action];
    return withJobToast(
      () => call(job.id),
      () => success,
      `Failed to ${action} job`,
      () => {
        refreshLists();
        void queryClient.invalidateQueries({ queryKey: jobsKeys.detail(job.id) });
      },
    );
  };

  /** Re-run several jobs after confirmation. Resolves true when the request went through. */
  const rerunMany = async (jobIds: string[]): Promise<boolean> => {
    if (jobIds.length === 0) return false;
    const confirmed = await confirm({
      title: `Re-run ${jobIds.length} selected job${jobIds.length === 1 ? "" : "s"}?`,
      description: "Each job will be enqueued again as a new job.",
      confirmLabel: "Re-run",
    });
    if (!confirmed) return false;
    try {
      const results = await jobsApi.rerunJobs(jobIds);
      const successCount = results.filter((r) => r.success).length;
      toast.success("Bulk Action Completed", {
        description: `Successfully triggered re-run for ${successCount} of ${results.length} jobs.`,
      });
      refreshLists();
      return true;
    } catch (error) {
      toast.error("Error", {
        description: error instanceof Error ? error.message : "Failed to re-run jobs",
      });
      return false;
    }
  };

  /** Delete every job in `state` after confirmation. */
  const purge = async (state: string): Promise<void> => {
    const confirmed = await confirm({
      title: `Purge all ${stateLabel(state)} jobs?`,
      description: "This permanently deletes every job in this state and cannot be undone.",
      confirmLabel: "Purge",
      destructive: true,
    });
    if (!confirmed) return;
    return withJobToast(
      () => jobsApi.purgeJobsByState(state),
      ({ deletedCount }) => `Purged ${deletedCount} ${stateLabel(state)} jobs`,
      "Failed to purge jobs",
      refreshLists,
    );
  };

  return { run, rerunMany, purge };
}
