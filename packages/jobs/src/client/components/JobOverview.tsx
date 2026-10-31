import { Card, CardContent, CardHeader, CardTitle } from "@groot/ui/card";
import { DataField, DataFields } from "@groot/ui/display";
import { formatDuration, formatLocaleDateTime, formatRelativeTime } from "@groot/shell/lib/utils";
import type { Job } from "@groot/jobs/client/types";

function jobDuration(start: string | null, end: string | null): string {
  if (!start || !end) return "N/A";
  return formatDuration(start, end);
}

/** Relative time with the full locale timestamp as the hover title. */
function Timestamp({ value, empty = "—" }: { value: string | null; empty?: string }) {
  if (!value) return <span title="N/A">{empty}</span>;
  return <span title={formatLocaleDateTime(value)}>{formatRelativeTime(value)}</span>;
}

/** Read-only metadata grid for a job (priority, retries, timestamps…). */
export function JobOverview({ job }: { job: Job }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <DataFields>
          <DataField label="Priority">{job.priority}</DataField>
          <DataField label="Retries">
            {job.retryCount} / {job.retryLimit}
          </DataField>
          <DataField label="Retry Delay">{job.retryDelay}s</DataField>
          <DataField label="Created">
            <Timestamp value={job.createdAt} empty="N/A" />
          </DataField>
          <DataField label="Run At">
            <Timestamp value={job.runAt} empty="N/A" />
          </DataField>
          <DataField label="Started">
            <Timestamp value={job.startedAt} />
          </DataField>
          <DataField label="Completed">
            <Timestamp value={job.completedAt} />
          </DataField>
          <DataField label="Duration">{jobDuration(job.startedAt, job.completedAt)}</DataField>
        </DataFields>
      </CardContent>
    </Card>
  );
}
