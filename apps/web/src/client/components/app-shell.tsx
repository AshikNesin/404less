// App shell: a quiet sidebar (brand, site switcher, site-scoped nav, team nav,
// account) and an inset content panel. Mobile gets a top bar + drawer.
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@groot/shell/store/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@groot/ui/dropdown-menu";
import {
  Bell,
  Bot,
  Check,
  ChevronsUpDown,
  Globe,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Plus,
  Settings,
  Unlink,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "../lib/router";
import { getLastSiteId, setLastSiteId } from "../lib/site-memory";
import type { Site } from "../lib/types";
import { cn } from "../lib/utils";
import { meQuery, useSites } from "../features/sites/queries";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

/**
 * The mark: a "4" whose crossbar runs on into an arrow: 404, moved past.
 * Graphite tile, white glyph. Same geometry as public/favicon.svg.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <g fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.5 7.5v18" />
        <path d="M17.5 7.5 7.5 19.5h17" />
        <path d="m21.5 16 3.5 3.5-3.5 3.5" />
      </g>
    </svg>
  );
}

/** The mark without its tile, in the current text color, for inline use. */
export function BrandGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17.5 7.5v18" />
      <path d="M17.5 7.5 7.5 19.5h17" />
      <path d="m21.5 16 3.5 3.5-3.5 3.5" />
    </svg>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold", className)}>
      <BrandMark className="size-6" />
      <span className="text-[0.9375rem]">
        404<span className="font-medium text-muted-foreground">less</span>
      </span>
    </span>
  );
}

/** The site the sidebar is scoped to: the route's, else the last visited, else the first. */
export function useActiveSite(): { site: Site | null; sites: Site[]; isPending: boolean } {
  const { siteId } = useParams<{ siteId?: string }>();
  const sitesQ = useSites();
  const sites = sitesQ.data ?? [];
  const remembered = getLastSiteId();
  const site =
    sites.find((s) => s.id === siteId) ??
    sites.find((s) => s.id === remembered) ??
    sites[0] ??
    null;
  useEffect(() => {
    if (siteId && sites.some((s) => s.id === siteId)) setLastSiteId(siteId);
  }, [siteId, sites]);
  return { site, sites, isPending: sitesQ.isPending };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNav, setMobileNav] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileNav(false), [location.pathname]);
  // the drawer closes on Escape, like any overlay
  useEffect(() => {
    if (!mobileNav) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileNav(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNav]);

  return (
    <div className="flex min-h-screen bg-sidebar">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-300 ease-drawer md:sticky md:top-0 md:h-screen md:translate-x-0",
          mobileNav ? "translate-x-0 shadow-2xl" : "-translate-x-full",
        )}
      >
        <SidebarContent />
      </aside>
      {/* scrim: always mounted so it fades with the drawer instead of popping in and out */}
      <div
        aria-hidden
        className={cn(
          "fixed inset-0 z-20 bg-foreground/25 transition-opacity duration-300 ease-drawer md:hidden",
          mobileNav ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setMobileNav(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col md:pt-2">
        <div className="flex min-h-full flex-1 flex-col bg-background md:rounded-tl-xl md:border-t md:border-l md:border-sidebar-border">
          <header className="flex h-12 items-center gap-2 border-b border-border bg-card px-3 md:hidden">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setMobileNav(true)}
              aria-label="Open menu"
            >
              <MenuIcon />
            </Button>
            <Brand />
          </header>
          <main className="flex-1 px-4 py-5 md:px-8 md:py-7">{children}</main>
        </div>
      </div>
    </div>
  );
}

function SidebarContent() {
  const { site, sites, isPending } = useActiveSite();
  return (
    <>
      <div className="px-3 pt-4 pb-2">
        <Link to="/app" className="flex items-center px-1 pb-3">
          <Brand />
        </Link>
        <SiteSwitcher active={site} sites={sites} isPending={isPending} />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2" aria-label="Main navigation">
        {site ? (
          <NavGroup label="Site">
            <NavLink
              to="/app/sites/$siteId"
              params={{ siteId: site.id }}
              icon={LayoutDashboard}
              label="Overview"
              exact
            />
            <NavLink
              to="/app/sites/$siteId/links"
              params={{ siteId: site.id }}
              icon={Unlink}
              label="Broken links"
              badge={site.open_links || undefined}
            />
            <NavLink
              to="/app/sites/$siteId/crawl"
              params={{ siteId: site.id }}
              icon={Bot}
              label="Crawler"
            />
            <NavLink
              to="/app/sites/$siteId/settings"
              params={{ siteId: site.id }}
              icon={Settings}
              label="Site settings"
            />
          </NavGroup>
        ) : isPending ? (
          <div className="space-y-2 px-2 py-1" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-7" />
            ))}
          </div>
        ) : (
          <NavGroup label="Site">
            <NavLink to="/app/sites/new" icon={Plus} label="Add your first site" />
          </NavGroup>
        )}
        <NavGroup label="Team">
          <NavLink to="/app/settings/channels" icon={Bell} label="Notifications" />
          <NavLink to="/app/settings/api-keys" icon={KeyRound} label="API & MCP" />
        </NavGroup>
      </nav>
      <AccountFooter />
    </>
  );
}

function SiteSwitcher({
  active,
  sites,
  isPending,
}: {
  active: Site | null;
  sites: Site[];
  isPending: boolean;
}) {
  const location = useLocation();
  if (isPending) {
    return (
      <div
        className="flex h-12 items-center rounded-lg border border-sidebar-border bg-background px-3"
        aria-busy
      >
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      </div>
    );
  }
  // Keep the current section when switching sites (overview/links/crawl/settings).
  const section = location.pathname.match(/^\/sites\/[^/]+\/(links|crawl|settings)(?=\/|$)/)?.[1];
  const hrefFor = (s: Site) => `/app/sites/${s.id}${section ? `/${section}` : ""}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-12 w-full cursor-pointer items-center gap-2.5 rounded-lg border border-sidebar-border bg-background px-2.5 text-left shadow-xs hover:bg-foreground/[0.02] aria-expanded:bg-foreground/[0.02]"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-foreground/[0.06] text-foreground">
            <Globe className="size-3.5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[0.8125rem] font-medium">
              {active?.name ?? "Select a site"}
            </span>
            {/* the name defaults to the domain: don't print it twice */}
            {(!active || active.domain !== active.name) && (
              <span className="truncate text-meta">
                {active?.domain ?? `${sites.length} sites`}
              </span>
            )}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[13.5rem]">
        <DropdownMenuLabel>Sites</DropdownMenuLabel>
        {sites.map((s) => (
          <DropdownMenuItem
            key={s.id}
            asChild
            className={cn(s.id === active?.id && "bg-foreground/[0.05] font-medium")}
          >
            <Link to={hrefFor(s)}>
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {s.open_links > 0 && (
                <span className="num rounded bg-destructive/10 px-1 text-[0.6875rem] font-medium text-destructive">
                  {s.open_links}
                </span>
              )}
              {s.id === active?.id && <Check />}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/app/sites/new">
            <Plus /> Add site
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountFooter() {
  const me = useQuery(meQuery);
  const qc = useQueryClient();
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const email = me.data?.user.email;
  return (
    <div className="border-t border-sidebar-border p-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-sidebar-accent aria-expanded:bg-sidebar-accent"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground/[0.08] text-[0.6875rem] font-semibold uppercase">
              {email?.[0] ?? "…"}
            </span>
            <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-foreground/80">
              {email ?? "Account"}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-[13.5rem]">
          <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
          <div className="truncate px-2 pb-1.5 text-[0.8125rem]">{email}</div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href="https://github.com/AshikNesin/404less" target="_blank" rel="noreferrer">
              <Globe /> Docs &amp; source
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              await logout();
              qc.clear();
              navigate("/login");
            }}
          >
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-2 pb-1.5 text-eyebrow text-sidebar-foreground/45">{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavLink({
  to,
  icon: Icon,
  label,
  params,
  exact,
  badge,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  params?: Record<string, string>;
  exact?: boolean;
  badge?: number;
}) {
  return (
    <Link
      to={to}
      params={params}
      activeOptions={{ exact: !!exact }}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[0.8125rem] text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        "data-[status=active]:bg-sidebar-accent data-[status=active]:font-medium data-[status=active]:text-sidebar-foreground",
        "data-[status=active]:before:absolute data-[status=active]:before:inset-y-1.5 data-[status=active]:before:-left-3 data-[status=active]:before:w-[3px] data-[status=active]:before:rounded-r-full data-[status=active]:before:bg-primary",
      )}
    >
      <Icon className="size-4 shrink-0 text-sidebar-foreground/55 group-data-[status=active]:text-foreground" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge !== undefined && (
        <span className="num rounded-md bg-destructive/10 px-1.5 text-[0.6875rem] font-medium text-destructive">
          {badge}
        </span>
      )}
    </Link>
  );
}
