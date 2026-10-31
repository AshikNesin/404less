import { Button } from "@groot/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@groot/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@groot/ui/breadcrumb";
import { ErrorState } from "@groot/ui/empty-state";
import { Skeleton } from "@groot/ui/loading-skeleton";
import { DataField, DataFields } from "@groot/ui/display";
import { monoClass } from "@groot/ui/typography";
import { StatusBadge } from "@groot/ui";
import { PageContainer } from "@groot/shell/components/layout/PageContainer";
import { PageLayout } from "@groot/shell/components/layout/PageLayout";
import { JobActions } from "./components/JobActions";
import { JobJsonBlock } from "./components/JobJsonBlock";
import { JobLogs } from "./components/JobLogs";
import { JobOverview } from "./components/JobOverview";
import { JobDetailSkeleton } from "./components/skeletons";
import { useJobDetail } from "./useJobDetail";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

export function JobDetail() {
  const navigate = useNavigate();
  const { job, loading, error, logs } = useJobDetail();

  if (loading) {
    return (
      <PageContainer maxWidth="5xl">
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Skeleton className="h-4 w-10" />
          <ChevronRight className="size-3.5" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="mt-4">
          <JobDetailSkeleton />
        </div>
      </PageContainer>
    );
  }

  // a failed background poll keeps showing the job it already loaded
  if (!job) {
    return (
      <PageContainer maxWidth="5xl">
        <Button variant="ghost" onClick={() => navigate("/jobs")} className="mb-4 -ml-2">
          <ArrowLeft className="size-4" />
          Back to Jobs
        </Button>
        <ErrorState
          title="Job Not Found"
          description={error || "The job you are looking for does not exist."}
        />
      </PageContainer>
    );
  }

  const actions = <JobActions job={job} onDeleted={() => navigate("/jobs")} />;

  const breadcrumb = (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/jobs">Jobs</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>{job.name}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );

  return (
    <PageLayout
      maxWidth="5xl"
      title={job.name}
      titleAdornment={<StatusBadge status={job.state} />}
      description={<span className="truncate font-mono text-xs">{job.id}</span>}
      breadcrumb={breadcrumb}
      actions={actions}
    >
      <JobOverview job={job} />

      <JobJsonBlock label="Data" value={job.data} />

      {job.output != null && <JobJsonBlock label="Output" value={job.output} />}

      {/* Error Details */}
      {job.error && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-destructive/10 p-4 text-xs text-destructive">
              {job.error}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Singleton Info */}
      {job.singletonKey && (
        <Card>
          <CardHeader>
            <CardTitle>Singleton</CardTitle>
          </CardHeader>
          <CardContent>
            <DataFields columns={2}>
              <DataField label="Key" valueClassName={monoClass}>
                {job.singletonKey}
              </DataField>
            </DataFields>
          </CardContent>
        </Card>
      )}

      <JobLogs logs={logs} />
    </PageLayout>
  );
}
