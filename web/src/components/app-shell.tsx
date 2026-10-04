// Sidebar shell modeled on open-seo's AuthenticatedAppLayout: brand, nav groups
// with active indicators, footer with sign-out.
import { Link, useLocation } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, LayoutDashboard, LogOut, Bell, KeyRound, type LucideIcon } from 'lucide-react';
import { api } from '../lib/api';
import type { Site } from '../lib/types';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

export function AppShell({ children, ready = true }: { children: React.ReactNode; ready?: boolean }) {
  const { data } = useQuery({ queryKey: ['sites'], queryFn: () => api<{ sites: Site[] }>('/api/sites') });
  const qc = useQueryClient();
  const sites = data?.sites ?? [];

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex h-14 items-center px-4">
          <span className="text-lg font-semibold tracking-tight">
            404<span className="text-primary">less</span>
          </span>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-2 text-sm">
          <NavGroup label="Monitor">
            <NavLink to="/app" icon={LayoutDashboard} label="Overview" exact />
          </NavGroup>
          <NavGroup label="Sites">
            {ready && sites.length === 0 && (
              <p className="px-3 py-1.5 text-xs text-muted-foreground">No sites yet</p>
            )}
            {sites.map((s) => (
              <NavLink key={s.id} to="/app/sites/$siteId" params={{ siteId: s.id }} icon={Globe} label={s.name} />
            ))}
          </NavGroup>
          <NavGroup label="Team">
            <NavLink to="/app/settings/channels" icon={Bell} label="Notifications" />
            <NavLink to="/app/settings/api-keys" icon={KeyRound} label="API keys" />
          </NavGroup>
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/70"
            onClick={async () => {
              await api('/auth/logout', { method: 'POST' });
              qc.clear();
              window.location.href = '/';
            }}
          >
            <LogOut /> Sign out
          </Button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur">
          <Breadcrumbs />
        </header>
        <main className="mx-auto max-w-5xl p-6">{ready ? children : null}</main>
      </div>
    </div>
  );
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 pb-1 pt-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground/80">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavLink({
  to, icon: Icon, label, params, exact,
}: { to: string; icon: LucideIcon; label: string; params?: Record<string, string>; exact?: boolean }) {
  const location = useLocation();
  const target = params && to.includes('$siteId') ? to.replace('$siteId', params.siteId) : to;
  const active = exact ? location.pathname === target : location.pathname.startsWith(target);
  return (
    <Link
      to={to as never}
      params={params as never}
      className={cn(
        'relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
        active && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-r-full before:bg-primary',
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function Breadcrumbs() {
  const location = useLocation();
  const parts = location.pathname.split('/').filter(Boolean);
  const names: Record<string, string> = { app: 'Dashboard', settings: 'Settings', sites: 'Sites', 'api-keys': 'API keys', channels: 'Notifications' };
  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-muted-foreground/50">/</span>}
          <span className={i === parts.length - 1 ? 'font-medium text-foreground' : ''}>
            {names[p] ?? (p.length > 8 ? p.slice(0, 8) + '…' : p)}
          </span>
        </span>
      ))}
    </div>
  );
}
