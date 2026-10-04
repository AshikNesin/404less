// App shell — quiet sidebar, context header, designed like a Stripe dashboard.
import { Link, useLocation } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, LayoutDashboard, LogOut, Bell, KeyRound, Menu, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Site } from '../lib/types';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" className="fill-primary" />
      <text x="15" y="21.5" fontSize="13" fontWeight="700" fill="#fff" textAnchor="middle" fontFamily="ui-monospace,monospace">404</text>
      <rect x="23" y="23" width="5" height="5" rx="1.5" fill="#a5a0ff" />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data } = useQuery({ queryKey: ['sites'], queryFn: () => api<{ sites: Site[] }>('/api/sites') });
  const qc = useQueryClient();
  const sites = data?.sites ?? [];
  const [mobileNav, setMobileNav] = useState(false);

  // Keyboard shortcuts: Alt+1 overview, Alt+2 notifications, Alt+3 API keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === '1') window.location.assign('/app');
      else if (e.key === '2') window.location.assign('/app/settings/channels');
      else if (e.key === '3') window.location.assign('/app/settings/api-keys');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-30 flex w-[220px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0',
        mobileNav ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="flex h-13 items-center gap-2 px-4 py-3.5">
          <BrandMark className="size-5" />
          <span className="text-[1.0625rem] font-semibold tracking-tight">
            404<span className="text-primary">less</span>
          </span>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-2">
          <NavGroup label="Monitor">
            <NavLink to="/app" icon={LayoutDashboard} label="Overview" exact />
          </NavGroup>
          <NavGroup label="Sites">
            {sites.length === 0 && (
              <p className="px-3 py-1 text-meta">No sites yet</p>
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
        <div className="border-t border-sidebar-border p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-foreground/60 hover:text-foreground"
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

      {/* Mobile scrim */}
      {mobileNav && (
        <div className="fixed inset-0 z-20 bg-foreground/20 md:hidden" onClick={() => setMobileNav(false)} />
      )}

      {/* Main */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex h-13 items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur md:px-6">
          <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setMobileNav(true)} aria-label="Menu">
            <Menu />
          </Button>
          <PageTitle />
        </header>
        <main className="mx-auto max-w-4xl space-y-8 p-4 py-6 md:p-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 pb-1.5 pt-2 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-subtle">
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
        'flex items-center gap-2 rounded-md px-3 py-1.5 text-[0.8125rem] text-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-foreground',
        active && 'bg-sidebar-accent font-medium text-foreground',
      )}
    >
      <Icon className="size-[15px] shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

// Header context label per section.
function PageTitle() {
  const location = useLocation();
  const m = location.pathname.match(/^\/app\/sites\/([^/]+)/);
  return <span className="text-[0.8125rem] font-medium text-foreground/80">{m ? 'Sites' : location.pathname === '/app' ? 'Overview' : location.pathname.includes('channels') ? 'Settings' : 'Settings'}</span>;
}
