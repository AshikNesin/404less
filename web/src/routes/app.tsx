// Authenticated app: session guard + the sidebar shell for every /app page.
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppShell } from '../components/app-shell';
import { meQuery, sitesListQuery } from '../features/sites/queries';
import type { Me } from '../lib/types';

export const Route = createFileRoute('/app')({
  beforeLoad: async ({ context }) => {
    const res = await fetch('/api/me');
    if (res.status === 401) throw redirect({ to: '/' });
    if (!res.ok) throw new Error(`Could not load your account (${res.status})`);
    const me = (await res.json()) as Me;
    context.queryClient.setQueryData(meQuery.queryKey, me);
    void context.queryClient.prefetchQuery(sitesListQuery);
    return { me };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
