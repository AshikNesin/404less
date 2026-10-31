// Site layout: resolves the site once; children read it via useCurrentSite().
import { Outlet, useParams } from "react-router-dom";
import { Link } from "../lib/router";
import { useSite } from "../features/sites/queries";
import { EmptyState } from "../components/ui/empty-state";
import { PageSkeleton } from "../components/ui/skeleton";
import { Button } from "../components/ui/button";
import { QueryError } from "../components/ui/query-state";

export function SiteLayout() {
  const { siteId } = useParams() as { siteId: string };
  const site = useSite(siteId);
  if (site.isPending) return <PageSkeleton />;
  // a failed request is not a missing site: say so and offer a retry
  if (site.isError && !site.data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <QueryError
          variant="plain"
          error={site.error}
          fallback="Could not load this site"
          onRetry={() => void site.refetch()}
          isRetrying={site.isFetching}
        />
      </div>
    );
  }
  if (!site.data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <EmptyState
          kind="error"
          variant="plain"
          size="lg"
          title="Site not found"
          description="It may have been deleted, or it belongs to a team you’re not part of."
          action={
            <Link to="/app">
              <Button variant="outline">Back to the app</Button>
            </Link>
          }
        />
      </div>
    );
  }
  // keyed: switching sites keeps the route mounted, and page state (form fields, selections) must not carry over
  return <Outlet key={siteId} />;
}
