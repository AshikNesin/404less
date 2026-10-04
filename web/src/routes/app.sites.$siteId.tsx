// Site detail — leads with health, then actions, then data.
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowLeft, Download, RefreshCw, X } from 'lucide-react';
import { api } from '../lib/api';
import type { Site, Event } from '../lib/types';
import { compact, relTime, fullTime, prettyUrl } from '../lib/format';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Table, TableCard, Td, Th, Tr } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Skeleton, TableSkeleton } from '../components/ui/skeleton';
import { Switch, Field } from '../components/ui/switch';
import { CopyButton } from '../components/copy-button';
import { useToast } from '../components/ui/toast';

export const Route = createFileRoute('/app/sites/$siteId')({ component: SiteDetail });

type TopRow = { url: string; hits: number; last_seen: number };
type BrokenRow = { url: string; status: number; redirect_chain: string | null; checked_at: number; sources: { source_url: string }[] };

function useSite(siteId: string) {
  return useQuery({
    queryKey: ['sites'],
    queryFn: () => api<{ sites: Site[] }>('/api/sites'),
    select: (d) => d.sites.find((s) => s.id === siteId),
  });
}

function SiteDetail() {
  const { siteId } = Route.useParams();
  const siteQ = useSite(siteId);
  const site = siteQ.data;
  const qc = useQueryClient();
  const toast = useToast();
  const [excl, setExcl] = useState('');

  const top = useQuery({
    queryKey: ['top', siteId],
    queryFn: () => api<{ results: TopRow[] }>(`/api/sites/${siteId}/top`),
  });
  const events = useQuery({
    queryKey: ['events', siteId],
    queryFn: () => api<{ events: Event[] }>(`/api/sites/${siteId}/events?limit=20`),
  });
  const crawlReport = useQuery({
    queryKey: ['crawl-report', siteId],
    queryFn: () => api<{ broken: BrokenRow[] }>(`/api/sites/${siteId}/crawl-report`),
    refetchInterval: 15_000,
  });

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/api/sites/${siteId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
    onError: (e: Error) => toast('error', e.message),
  });
  const importSitemap = useMutation({
    mutationFn: () => api<{ imported: number }>(`/api/sites/${siteId}/import-sitemap`, { method: 'POST', body: '{}' }),
    onSuccess: (d) => toast('success', `Imported ${compact(d.imported)} URLs from sitemap`),
    onError: (e: Error) => toast('error', e.message),
  });
  const crawlNow = useMutation({
    mutationFn: () => api(`/api/sites/${siteId}/crawl`, { method: 'POST', body: '{}' }),
    onSuccess: () => toast('info', 'Crawl started — results appear below as pages are checked'),
    onError: (e: Error) => toast('error', e.message),
  });

  if (siteQ.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }
  if (!site) return <EmptyState kind="error" title="Site not found" />;
  const origin = window.location.origin;
  const snippet = `<script src="${origin}/embed.js" data-site="${site.site_key}" defer></script>`;
  const brokenCount = crawlReport.data?.broken.length ?? 0;
  const hits24h = top.data?.results.reduce((n, r) => n + r.hits, 0) ?? 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-3">
        <Link to="/app" className="inline-flex items-center gap-1 text-meta hover:text-foreground">
          <ArrowLeft className="size-3" /> All sites
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-page-title">{site.name}</h1>
            <a href={`https://${site.domain}`} target="_blank" rel="noreferrer" className="text-caption hover:text-foreground">
              {site.domain} ↗
            </a>
          </div>
          <div className="flex gap-2">
            <a href={`/api/sites/${siteId}/events.csv`}>
              <Button variant="outline" size="sm"><Download /> Export</Button>
            </a>
          </div>
        </div>
        {/* Stat strip */}
        <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-xl border border-border bg-card">
          <Stat label="404 hits tracked" value={compact(hits24h)} sub={`${top.data?.results?.length ?? 0} unique URLs`} />
          <Stat
            label="Crawler findings"
            value={crawlReport.isLoading ? '…' : compact(brokenCount)}
            sub={site.crawl_enabled ? 'scheduled every 30 min' : 'crawling off'}
            tone={brokenCount > 0 ? 'destructive' : 'default'}
          />
          <Stat
            label="Alerts"
            value={site.notify_enabled ? 'On' : 'Off'}
            sub={`digest ${site.digest_minutes >= 1440 ? 'daily' : `every ${site.digest_minutes}m`}`}
          />
        </div>
      </div>

      {/* Install */}
      <Card>
        <CardHeader>
          <CardTitle>Realtime tracking</CardTitle>
          <CardDescription>Embed in your 404 template — captures every hit and shows visitors suggested links.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-muted px-3 py-2 text-code">{snippet}</code>
            <CopyButton value={snippet} />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" pending={importSitemap.isPending} onClick={() => importSitemap.mutate()}>
              <RefreshCw /> Import sitemap
            </Button>
            <span className="text-meta">Powers the suggestions widget</span>
          </div>
        </CardContent>
      </Card>

      {/* Crawler */}
      <Card>
        <CardHeader>
          <CardTitle>Site crawl</CardTitle>
          <CardDescription>Scans every link and asset on a schedule; new failures alert your channels.</CardDescription>
          <CardAction>
            <Button size="sm" pending={crawlNow.isPending} onClick={() => crawlNow.mutate()}>
              <RefreshCw /> Crawl now
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Scheduled crawling" hint={site.crawl_enabled ? 'Runs every 30 minutes' : 'Manual crawls only'}>
              <Switch checked={site.crawl_enabled !== 0} label="Scheduled crawling"
                onCheckedChange={(v) => patch.mutate({ crawl_enabled: v })} />
            </Field>
            <Field label="Max pages per crawl" hint="Protects free-tier limits">
              <Input type="number" min={1} max={500} defaultValue={site.crawl_max_pages || 100}
                onBlur={(e) => { const v = Number(e.target.value); if (v >= 1 && v <= 500) patch.mutate({ crawl_max_pages: v }); }}
                className="w-20" />
            </Field>
          </div>
          {crawlReport.isLoading ? (
            <TableSkeleton rows={3} cols={4} />
          ) : brokenCount > 0 ? (
            <TableCard>
              <Table>
                <thead><tr><Th>Broken URL</Th><Th>Status</Th><Th>Found on</Th><Th>Chain</Th></tr></thead>
                <tbody>
                  {crawlReport.data!.broken.map((b) => {
                    const chain = b.redirect_chain ? (JSON.parse(b.redirect_chain) as unknown[]).length : 0;
                    return (
                      <Tr key={b.url}>
                        <Td className="max-w-[280px] truncate"><a className="hover:underline" href={b.url} target="_blank" rel="noreferrer">{prettyUrl(b.url)}</a></Td>
                        <Td><Badge tone="destructive">{b.status || 'err'}</Badge></Td>
                        <Td className="max-w-[200px] truncate text-muted-foreground">{b.sources?.[0] ? prettyUrl(b.sources[0].source_url) : '—'}</Td>
                        <Td className="text-muted-foreground num">{chain ? `${chain} hops` : '—'}</Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableCard>
          ) : (
            <EmptyState title={site.crawl_enabled ? 'No broken links found' : 'Crawler idle'} description={site.crawl_enabled ? 'The last scheduled crawl found no broken links or assets.' : 'Enable scheduled crawling or run a manual crawl to check every link.'} />
          )}
        </CardContent>
      </Card>

      {/* Top broken */}
      <Card>
        <CardHeader>
          <CardTitle>Most-hit broken URLs</CardTitle>
          <CardDescription>From real visitor traffic.</CardDescription>
        </CardHeader>
        <CardContent>
          {top.isLoading ? <TableSkeleton rows={3} cols={3} /> :
           top.data?.results?.length ? (
            <TableCard>
              <Table>
                <thead><tr><Th>URL</Th><Th>Hits</Th><Th>Last seen</Th></tr></thead>
                <tbody>
                  {top.data.results.map((r) => (
                    <Tr key={r.url}>
                      <Td className="max-w-[320px] truncate"><a className="hover:underline" href={r.url} target="_blank" rel="noreferrer">{prettyUrl(r.url)}</a></Td>
                      <Td><Badge tone={r.hits >= 10 ? 'destructive' : r.hits >= 3 ? 'warning' : 'neutral'}>{compact(r.hits)}</Badge></Td>
                      <Td className="text-muted-foreground" title={fullTime(r.last_seen)}>{relTime(r.last_seen)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableCard>
          ) : (
            <EmptyState title="No 404s recorded" description="Hits appear here once the snippet is installed on your 404 page." />
          )}
        </CardContent>
      </Card>

      {/* Recent events */}
      <Card>
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
          <CardDescription>Latest visitor hits, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {events.isLoading ? <TableSkeleton rows={4} cols={3} /> :
           events.data?.events?.length ? (
            <TableCard>
              <Table>
                <thead><tr><Th>URL</Th><Th>Referrer</Th><Th>When</Th></tr></thead>
                <tbody>
                  {events.data.events.map((e) => (
                    <Tr key={e.id}>
                      <Td className="max-w-[300px] truncate">{prettyUrl(e.url)}</Td>
                      <Td className="max-w-[200px] truncate text-muted-foreground">{e.referrer ? prettyUrl(e.referrer) : '—'}</Td>
                      <Td className="text-muted-foreground" title={fullTime(e.ts)}>{relTime(e.ts)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableCard>
          ) : (
            <EmptyState title="No events yet" />
          )}
        </CardContent>
      </Card>

      {/* Settings */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Exclusions</CardTitle>
            <CardDescription>Matching URLs are never tracked or checked.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {site.exclude_patterns.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {site.exclude_patterns.map((p) => (
                  <span key={p} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-code">
                    {p}
                    <button aria-label={`Remove ${p}`} className="text-subtle hover:text-destructive"
                      onClick={() => patch.mutate({ exclude_patterns: site.exclude_patterns.filter((x) => x !== p) })}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!excl.trim()) return;
                await patch.mutateAsync({ exclude_patterns: [...site.exclude_patterns, excl.trim()] });
                setExcl('');
              }}
              className="flex gap-2"
            >
              <Input value={excl} onChange={(e) => setExcl(e.target.value)} placeholder="/wp-admin/*" className="font-mono text-xs" />
              <Button type="submit" variant="outline" size="sm">Add</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alerts</CardTitle>
            <CardDescription>Grouped digests; no per-hit spam.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Send alerts for this site">
              <Switch checked={site.notify_enabled !== 0} label="Send alerts"
                onCheckedChange={(v) => patch.mutate({ notify_enabled: v })} />
            </Field>
            <Field label="Digest window">
              <select
                value={String(site.digest_minutes || 15)}
                onChange={(e) => patch.mutate({ digest_minutes: Number(e.target.value) })}
                className="h-8 rounded-lg border border-input bg-card px-2 text-[0.8125rem]"
              >
                <option value="15">Every 15 min</option>
                <option value="60">Every hour</option>
                <option value="360">Every 6 hours</option>
                <option value="1440">Daily</option>
              </select>
            </Field>
            <Link to="/app/settings/channels" className="text-meta text-primary hover:underline">
              Manage channels →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone = 'default' }: { label: string; value: string; sub?: string; tone?: 'default' | 'destructive' }) {
  return (
    <div className="px-4 py-3">
      <div className="text-meta">{label}</div>
      <div className={tone === 'destructive' ? 'text-metric text-destructive' : 'text-metric'}>{value}</div>
      {sub && <div className="text-meta">{sub}</div>}
    </div>
  );
}
