// /app → the last-visited site's overview, or site creation when there are none.
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { sitesListQuery } from "../features/sites/queries";
import { getLastSiteId } from "../lib/site-memory";
import { resolvePath } from "../lib/router";
import { PageSkeleton } from "../components/ui/skeleton";
import { QueryError } from "../components/ui/query-state";

export function AppIndexPage() {
  const sites = useQuery(sitesListQuery);
  if (sites.isPending) return <PageSkeleton />;
  if (sites.isError) {
    return (
      <QueryError
        error={sites.error}
        fallback="Could not load your sites"
        onRetry={() => void sites.refetch()}
        isRetrying={sites.isFetching}
      />
    );
  }
  const list = sites.data.sites;
  if (!list.length) return <Navigate to={resolvePath("/app/sites/new")} replace />;
  const last = getLastSiteId();
  const site = list.find((s) => s.id === last) ?? list[0];
  return <Navigate to={resolvePath("/app/sites/$siteId", { siteId: site.id })} replace />;
}
