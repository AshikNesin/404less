// Authenticated app shell: sidebar + topbar, wraps all /app pages.
import { createFileRoute, Outlet, Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Site } from '../lib/types';

export const Route = createFileRoute('/app')({
  beforeLoad: async () => {
    const res = await fetch('/api/teams');
    if (res.status === 401) throw redirectHome();
  },
  component: AppShell,
});

const redirectHome = () => {
  window.location.href = '/';
  return new Promise(() => {});
};

function AppShell() {
  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api<{ sites: Site[] }>('/api/sites'),
  });
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await api('/auth/logout', { method: 'POST' });
    qc.clear();
    navigate({ to: '/' });
    window.location.href = '/';
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white md:block">
        <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4">
          <span className="text-lg font-semibold tracking-tight">
            404<span className="text-blue-600">less</span>
          </span>
        </div>
        <nav className="space-y-1 p-3 text-sm">
          <SidebarLink to="/app" label="Overview" exact />
          <div className="px-3 pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-slate-400">Sites</div>
          {(sites?.sites ?? []).map((s) => (
            <SidebarLink key={s.id} to="/app/sites/$siteId" params={{ siteId: s.id }} label={s.name} />
          ))}
          <div className="px-3 pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-slate-400">Team</div>
          <SidebarLink to="/app/settings/channels" label="Notifications" />
          <SidebarLink to="/app/settings/api-keys" label="API keys" />
        </nav>
        <div className="absolute bottom-0 w-60 border-t border-slate-200 p-3">
          <button onClick={signOut} className="w-full rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1">
        <div className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="text-sm text-slate-500">Dashboard</div>
        </div>
        <div className="mx-auto max-w-5xl p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function SidebarLink({ to, label, params, exact }: { to: string; label: string; params?: Record<string, string>; exact?: boolean }) {
  return (
    <Link
      to={to as never}
      params={params as never}
      className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100"
      activeProps={{ className: 'block rounded-lg px-3 py-2 bg-blue-50 text-blue-700 font-medium' }}
      activeOptions={{ exact: !!exact }}
    >
      {label}
    </Link>
  );
}
