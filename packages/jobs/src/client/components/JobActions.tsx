import { Button } from "@groot/ui/button";
import { allowedJobActions } from "../../lifecycle";
import { JOB_ACTION_UI } from "@groot/jobs/client/constants";
import type { Job } from "@groot/jobs/client/types";
import { useJobActions } from "@groot/jobs/client/useJobActions";

/** The actions the job's state allows, as buttons (job detail header). */
export function JobActions({ job, onDeleted }: { job: Job; onDeleted?: () => void }) {
  const { run } = useJobActions({ onDeleted });
  return (
    <div className="flex items-center gap-2 shrink-0">
      {allowedJobActions(job.state).map((action) => {
        const { label, icon: Icon, destructive } = JOB_ACTION_UI[action];
        return (
          <Button
            key={action}
            variant={destructive ? "ghost" : "outline"}
            onClick={() => void run(action, job)}
            className={destructive ? "text-destructive hover:text-destructive" : undefined}
          >
            <Icon className="size-4" />
            {label}
          </Button>
        );
      })}
    </div>
  );
}
