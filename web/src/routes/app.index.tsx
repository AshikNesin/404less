// Overview — leads with the number that matters: broken links.
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowRight, Globe, Plus } from 'lucide-react';
import { api } from '../lib/api';
import type { Site, Team } from '../lib/types';
import { compact, relTime, fullTime } from '../lib/format';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Badge } from '../components/ui/badge';
import { TableSkeleton } from '../components/ui/skeleton';
import { useToast } from '../components/ui/toast';

export const Route = createFileRoute('/app/')({ component: Overview });

function Overview() {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');

  const { data: teamsData } = useQuery({ queryKey: ['teams'], queryFn: () => api<{ teams: Team[] }>('/api/teams') });
  const { data: sitesData, isLoading } = useQuery({ queryKey: ['sites'], queryFn: () => api<{ sites: Site[] }>('/api/sites') });
  const { data: topData } = useQuery({
    queryKey: ['top-all'],
    queryFn: async () => {
      // aggregate top broken across all sites (best-effort, 3 per site)
      const sites = (await api<{ sites: Site[] }>('/api/sites')).sites;
      const rows = await Promise.all(sites.slice(0, 5).map((s) =>
        api<{ results: { url: string; hits: number; last_seen: number }[] }>(`/api/sites/${s.id}/top?limit=3`)
          .then((r) => r.results.map((x) => ({ ...x, site: s })))
          .catch(() => []),
      ));
      return rows.flat().sort((a, b) => b.hits - a.hits).slice(0, 6);
    },
  });
  const teams = teamsData?.teams ?? [];
  const sites = sitesData?.sites ?? [];
  const totalHits = topData?.reduce((n, r) => n + r.hits, 0) ?? 0;

  const addSite = useMutation({
    mutationFn: async () => {
      let teamId = teams[0]?.id;
      if (!teamId) {
        const t = await api<{ team: Team }>('/api/teams', { method: 'POST', body: JSON.stringify({ name: 'Default' }) });
        teamId = t.team.id;
        await qc.invalidateQueries({ queryKey: ['teams'] });
      }
      return api<{ site: Site }>('/api/sites', { method: 'POST', body: JSON.stringify({ teamId, name, domain }) });
    },
    onSuccess: () => {
      setName(''); setDomain('');
      toast('success', 'Site added — install the snippet from its page.');
      qc.invalidateQueries({ queryKey: ['sites'] });
      qc.invalidateQueries({ queryKey: ['top-all'] });
    },
    onError: (e: Error) => toast('error', e.message),
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-page-title">Overview</h1>
          <p className="text-caption mt-0.5">
            {sites.length === 0 ? 'Add your first site to start monitoring.' :
              `${sites.length} ${sites.length === 1 ? 'site' : 'sites'} · ${compact(totalHits)} 404 hit${totalHits === 1 ? '' : 's'} tracked`}
          </p>
        </div>
        <Dialogish />
      </div>

      {sites.length === 0 && !isLoading ? (
        <EmptyState
          title="Monitor your first site"
          description="404less watches every link in real time and scans your whole site on a schedule. Add a site to get an embed snippet."
          action={
            <form onSubmit={(e) => { e.preventDefault(); addSite.mutate(); }} className="flex flex-wrap gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Site name" required className="w-36" />
              <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" required className="w-44" />
              <Button type="submit" pending={addSite.isPending}><Plus /> Add site</Button>
            </form>
          }
        />
      ) : (
        <>
          {/* Sites */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-section-title">Sites</h2>
              <form onSubmit={(e) => { e.preventDefault(); addSite.mutate(); }} className="flex gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required className="w-28" />
                <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" required className="w-40" />
                <Button type="submit" size="sm" pending={addSite.isPending}><Plus /> Add</Button>
              </form>
            </div>
            {isLoading ? (
              <TableSkeleton rows={3} cols={3} />
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {sites.map((s) => (
                  <Link
                    key={s.id}
                    to="/app/sites/$siteId"
                    params={{ siteId: s.id }}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
                  >
                    <Globe className="size-4 shrink-0 text-subtle" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[0.8125rem] font-medium">{s.name}</div>
                      <div className="truncate text-meta">{s.domain}</div>
                    </div>
                    {s.crawl_enabled === 1 && <Badge tone="outline">crawling</Badge>}
                    {s.notify_enabled === 1 && <Badge tone="outline">alerts on</Badge>}
                    <ArrowRight className="size-4 shrink-0 text-subtle" />
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Top broken across sites */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-section-title">Most-hit broken URLs</h2>
              <span className="text-meta">across all sites</span>
            </div>
            {topData && topData.length > 0 ? (
              <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
                {topData.map((r) => (
                  <a key={r.url} href={r.url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[0.8125rem]">{r.url.replace(/^https?:\/\//, '')}</div>
                      <div className="text-meta">{r.site.name}</div>
                    </div>
                    <Badge tone={r.hits >= 10 ? 'destructive' : r.hits >= 3 ? 'warning' : 'neutral'} dot>
                      {compact(r.hits)} hit{r.hits === 1 ? '' : 's'}
                    </Badge>
                    <span className="w-16 text-right text-meta" title={fullTime(r.last_seen)}>{relTime(r.last_seen)}</span>
                  </a>
                ))}
              </div>
            ) : topData ? (
              <EmptyState title="No 404s recorded yet" description="Install the embed snippet on your sites to capture broken-link hits in real time." />
            ) : (
              <TableSkeleton rows={3} cols={2} />
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Dialogish() { return null; }
