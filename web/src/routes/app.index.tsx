// /app → the last-visited site's overview, or site creation when there are none.
import { createFileRoute, redirect } from '@tanstack/react-router';
import { sitesListQuery } from '../features/sites/queries';
import { getLastSiteId } from '../lib/site-memory';

export const Route = createFileRoute('/app/')({
  beforeLoad: async ({ context }) => {
    const { sites } = await context.queryClient.ensureQueryData(sitesListQuery);
    if (!sites.length) throw redirect({ to: '/app/sites/new' });
    const last = getLastSiteId();
    const site = sites.find((s) => s.id === last) ?? sites[0];
    throw redirect({ to: '/app/sites/$siteId', params: { siteId: site.id } });
  },
});
