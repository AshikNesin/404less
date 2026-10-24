// Site layout: resolves the site once; children read it via useCurrentSite().
import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { sitesListQuery, useSite } from '../features/sites/queries';
import { EmptyState } from '../components/ui/empty-state';
import { PageSkeleton } from '../components/ui/skeleton';
import { Button } from '../components/ui/button';

export const Route = createFileRoute('/app/sites/$siteId')({
  loader: ({ context }) => context.queryClient.ensureQueryData(sitesListQuery),
  component: SiteLayout,
});

function SiteLayout() {
  const { siteId } = Route.useParams();
  const site = useSite(siteId);
  if (site.isPending) return <PageSkeleton />;
  if (!site.data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <EmptyState kind="error" variant="plain" size="lg" title="Site not found" description="It may have been deleted, or it belongs to a team you’re not part of."
          action={<Link to="/app"><Button variant="outline">Back to the app</Button></Link>} />
      </div>
    );
  }
  return <Outlet />;
}
