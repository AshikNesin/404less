import { Button } from "@groot/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@groot/ui/dialog";
import { Input } from "@groot/ui/input";
import { Field } from "@groot/ui/form";
import { jobsApi } from "@groot/jobs/client/api";
import { jobsKeys } from "@groot/jobs/client/queries";
import type { JobSchedule } from "@groot/jobs/client/types";
import { withJobToast } from "@groot/jobs/client/utils";
import { JobDataEditor } from "./JobDataEditor";
import { JobTypeSelect } from "./JobTypeSelect";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Calendar as CalendarIcon } from "lucide-react";

type Props = {
  /** Edit this schedule; omit to create a new one. */
  schedule?: JobSchedule;
  /** Defaults to the "Schedule" header button. */
  trigger?: ReactNode;
};

/**
 * Create or edit a recurring cron schedule. Schedules are keyed by job name,
 * so editing keeps the name and saves through the same upsert as creating.
 */
export function ScheduleJobDialog({ schedule, trigger }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <CalendarIcon className="size-4" />
            <span className="hidden md:inline">Schedule</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{schedule ? "Edit Scheduled Job" : "Schedule Recurring Job"}</DialogTitle>
          <DialogDescription>
            {schedule
              ? `Update the cron schedule or data for "${schedule.name}"`
              : "Schedule a job to run on a recurring cron schedule"}
          </DialogDescription>
        </DialogHeader>
        <ScheduleJobForm schedule={schedule} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Mounted only while the dialog is open, so every opening starts from the saved values. */
function ScheduleJobForm({ schedule, onDone }: { schedule?: JobSchedule; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(schedule?.name ?? "");
  const [cron, setCron] = useState(schedule?.cron ?? "");
  const [data, setData] = useState(() => JSON.stringify(schedule?.data ?? {}, null, 2));

  const submit = () => {
    if (!name || !cron) {
      toast.error("Error", {
        description: "Please select a job name and provide a cron expression",
      });
      return;
    }
    return withJobToast(
      () =>
        jobsApi.scheduleJob(
          name,
          cron,
          JSON.parse(data),
          schedule?.timezone ? { timezone: schedule.timezone } : undefined,
        ),
      () => (schedule ? "Scheduled job has been updated" : "Job has been scheduled"),
      schedule ? "Failed to update scheduled job" : "Failed to schedule job",
      () => {
        onDone();
        void queryClient.invalidateQueries({ queryKey: jobsKeys.scheduled });
      },
    );
  };

  return (
    <DialogBody className="space-y-5">
      <Field label="Job type" htmlFor="scheduled-job-name">
        <JobTypeSelect
          id="scheduled-job-name"
          value={name}
          onChange={setName}
          disabled={Boolean(schedule)}
        />
      </Field>
      <Field
        label="Cron expression"
        htmlFor="scheduled-job-cron"
        hint={`Example: "*/5 * * * *" runs every 5 minutes`}
      >
        <Input
          id="scheduled-job-cron"
          value={cron}
          onChange={(e) => setCron(e.target.value)}
          placeholder="*/5 * * * *"
        />
      </Field>
      <Field label="Job data (JSON)" htmlFor="scheduled-job-data">
        <JobDataEditor value={data} onChange={setData} />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={() => void submit()}>{schedule ? "Save Changes" : "Schedule Job"}</Button>
      </div>
    </DialogBody>
  );
}
