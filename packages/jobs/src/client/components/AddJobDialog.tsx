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
import { Field } from "@groot/ui/form";
import { jobsApi } from "@groot/jobs/client/api";
import { jobsKeys } from "@groot/jobs/client/queries";
import { formatJobId, withJobToast } from "@groot/jobs/client/utils";
import { JobDataEditor } from "./JobDataEditor";
import { JobTypeSelect } from "./JobTypeSelect";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus } from "lucide-react";

/** Manually trigger a one-off job. Renders its own trigger. */
export function AddJobDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          <span className="hidden md:inline">Add Job</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add New Job</DialogTitle>
          <DialogDescription>Manually trigger a background job</DialogDescription>
        </DialogHeader>
        <AddJobForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Mounted only while the dialog is open, so every opening starts from a blank draft. */
function AddJobForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [data, setData] = useState("{}");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!name) {
      toast.error("Error", { description: "Please select a job name" });
      return;
    }
    if (pending) return; // a double click must not enqueue the job twice
    setPending(true);
    await withJobToast(
      () => jobsApi.addJob(name, JSON.parse(data)),
      (jobId) => (
        <span>
          Job has been added to the queue.{" "}
          <Link to={`/jobs/${jobId}`} className="underline font-medium hover:text-foreground">
            View job ({formatJobId(jobId)})
          </Link>
        </span>
      ),
      "Failed to add job",
      () => {
        onDone();
        void queryClient.invalidateQueries({ queryKey: jobsKeys.list });
        void queryClient.invalidateQueries({ queryKey: jobsKeys.stats });
      },
    );
    setPending(false);
  };

  return (
    <DialogBody className="space-y-5">
      <Field label="Job type" htmlFor="job-name">
        <JobTypeSelect id="job-name" value={name} onChange={setName} />
      </Field>
      <Field
        label="Job data (JSON)"
        htmlFor="job-data"
        hint="The payload passed to the job handler."
      >
        <JobDataEditor value={data} onChange={setData} />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={() => void submit()} disabled={pending}>
          Add Job
        </Button>
      </div>
    </DialogBody>
  );
}
