// Site detail: install, top broken, crawler report, recent events, settings.
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowLeft, Download, RefreshCw, X } from 'lucide-react';
import { api } from '../lib/api';
import type { Site, Event } from '../lib/types';
import { Button } from '../components/ui/button';
import { Input, Select } from '../components/ui/input';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Table, TableCard, Td, Th, Tr } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { CopyButton } from '../components/copy-button';

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

function fmt(ts: number) {
  return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
}

function SiteDetail() {
  const { siteId } = Route.useParams();
  const site = useSite(siteId).data;
  const qc = useQueryClient();
  const [excl, setExcl] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [crawlMsg, setCrawlMsg] = useState('');

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
  });
  const importSitemap = useMutation({
    mutationFn: () => api<{ imported: number }>(`/api/sites/${siteId}/import-sitemap`, { method: 'POST', body: '{}' }),
    onSuccess: (d) => setImportMsg(`Imported ${d.imported} URLs`),
    onError: (e: Error) => setImportMsg(e.message),
  });
  const crawlNow = useMutation({
    mutationFn: () => api(`/api/sites/${siteId}/crawl`, { method: 'POST', body: '{}' }),
    onSuccess: () => setCrawlMsg('Crawl started — report refreshes automatically'),
    onError: (e: Error) => setCrawlMsg(e.message),
  });

  if (!site) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const origin = window.location.origin;
  const snippet = `<script src="${origin}/embed.js" data-site="${site.site_key}" defer></script>`;

  async function addExclusion(e: React.FormEvent) {
    e.preventDefault();
    if (!excl.trim()) return;
    await patch.mutateAsync({ exclude_patterns: [...site!.exclude_patterns, excl.trim()] });
    setExcl('');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/app" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3" /> Overview
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">{site.name}</h1>
          <p className="text-sm text-muted-foreground">{site.domain}</p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/sites/${siteId}/events.csv`}>
            <Button variant="outline" size="sm"><Download /> CSV</Button>
          </a>
          <a href={`/api/sites/${siteId}/events.csv?group=url`}>
            <Button variant="outline" size="sm"><Download /> Grouped CSV</Button>
          </a>
        </div>
      </div>

      {/* Install */}
      <Card>
        <CardHeader>
          <CardTitle>Install</CardTitle>
          <CardDescription>Add to your site's 404 template to track hits and show suggestions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-muted px-3 py-2 text-xs">{snippet}</code>
            <CopyButton value={snippet} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" pending={importSitemap.isPending} onClick={() => importSitemap.mutate()}>
              <RefreshCw /> Import sitemap
            </Button>
            {importMsg && <span className="text-xs text-muted-foreground">{importMsg}</span>}
          </div>
        </CardContent>
      </Card>

      {/* Crawler */}
      <Card>
        <CardHeader>
          <CardTitle>Crawler</CardTitle>
          <CardDescription>Scheduled scanning of links and assets; new failures alert your channels.</CardDescription>
          <CardAction>
            <Button size="sm" pending={crawlNow.isPending} onClick={() => crawlNow.mutate()}>
              <RefreshCw /> Crawl now
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={site.crawl_enabled !== 0}
                onChange={(e) => patch.mutate({ crawl_enabled: e.target.checked })} />
              Scheduled (every 30 min)
            </label>
            <label className="flex items-center gap-2 text-sm">
              Max pages
              <Input type="number" min={1} max={500} defaultValue={site.crawl_max_pages || 100}
                onBlur={(e) => { const v = Number(e.target.value); if (v >= 1 && v <= 500) patch.mutate({ crawl_max_pages: v }); }}
                className="w-20" />
            </label>
            {crawlMsg && <span className="text-xs text-muted-foreground">{crawlMsg}</span>}
          </div>
          {crawlReport.data && crawlReport.data.broken.length > 0 ? (
            <TableCard>
              <Table>
                <thead>
                  <tr><Th>URL</Th><Th>Status</Th><Th>Found on</Th><Th>Chain</Th></tr>
                </thead>
                <tbody>
                  {crawlReport.data.broken.map((b) => {
                    const chain = b.redirect_chain ? (JSON.parse(b.redirect_chain) as unknown[]).length : 0;
                    return (
                      <Tr key={b.url}>
                        <Td className="max-w-[300px] truncate"><a className="text-primary hover:underline" href={b.url} target="_blank" rel="noreferrer">{b.url}</a></Td>
                        <Td><Badge tone="destructive">{b.status || 'err'}</Badge></Td>
                        <Td className="max-w-[220px] truncate text-muted-foreground">{b.sources?.[0]?.source_url ?? '—'}</Td>
                        <Td className="text-muted-foreground">{chain ? `${chain} hops` : '—'}</Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableCard>
          ) : (
            <EmptyState title="No broken links from the last crawl" description="Enable scheduled crawling or run 'Crawl now' to scan every link and asset." />
          )}
        </CardContent>
      </Card>

      {/* Top broken (realtime) */}
      <Card>
        <CardHeader>
          <CardTitle>Top broken URLs</CardTitle>
          <CardDescription>Aggregated from real visitor 404 hits.</CardDescription>
        </CardHeader>
        <CardContent>
          {top.data?.results?.length ? (
            <TableCard>
              <Table>
                <thead><tr><Th>URL</Th><Th>Hits</Th><Th>Last seen</Th></tr></thead>
                <tbody>
                  {top.data.results.map((r) => (
                    <Tr key={r.url}>
                      <Td className="max-w-[340px] truncate"><a className="text-primary hover:underline" href={r.url} target="_blank" rel="noreferrer">{r.url}</a></Td>
                      <Td><Badge tone="info">{r.hits}</Badge></Td>
                      <Td className="text-muted-foreground">{fmt(r.last_seen)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableCard>
          ) : (
            <EmptyState title="No 404s recorded yet" description="Install the embed snippet on your 404 page to capture visitor hits in realtime." />
          )}
        </CardContent>
      </Card>

      {/* Recent events */}
      <Card>
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
          <CardDescription>Latest 20 visitor hits.</CardDescription>
        </CardHeader>
        <CardContent>
          {events.data?.events?.length ? (
            <TableCard>
              <Table>
                <thead><tr><Th>URL</Th><Th>Referrer</Th><Th>When</Th></tr></thead>
                <tbody>
                  {events.data.events.map((e) => (
                    <Tr key={e.id}>
                      <Td className="max-w-[320px] truncate">{e.url}</Td>
                      <Td className="max-w-[220px] truncate text-muted-foreground">{e.referrer ?? '—'}</Td>
                      <Td className="text-muted-foreground">{fmt(e.ts)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableCard>
          ) : (
            <EmptyState title="Nothing yet" description="Events appear here as visitors hit broken URLs." />
          )}
        </CardContent>
      </Card>

      {/* Settings */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Exclusions</CardTitle>
            <CardDescription>URLs matching these patterns are never tracked or checked.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {site.exclude_patterns.length === 0 ? (
              <p className="text-xs text-muted-foreground">None</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {site.exclude_patterns.map((p) => (
                  <span key={p} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs">
                    <span className="font-mono">{p}</span>
                    <button aria-label={`Remove ${p}`} className="text-muted-foreground hover:text-destructive"
                      onClick={() => patch.mutate({ exclude_patterns: site.exclude_patterns.filter((x) => x !== p) })}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <form onSubmit={addExclusion} className="flex gap-2">
              <Input value={excl} onChange={(e) => setExcl(e.target.value)} placeholder="/wp-admin/* or substring" className="font-mono" />
              <Button type="submit" variant="outline">Add</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Digests go to every enabled channel.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={site.notify_enabled !== 0}
                onChange={(e) => patch.mutate({ notify_enabled: e.target.checked })} />
              Send alerts for this site
            </label>
            <label className="flex items-center gap-2 text-sm">
              Digest window
              <Select value={String(site.digest_minutes || 15)}
                onChange={(e) => patch.mutate({ digest_minutes: Number(e.target.value) })}>
                <option value="15">15 min</option>
                <option value="60">60 min</option>
                <option value="360">6 hours</option>
                <option value="1440">Daily</option>
              </Select>
            </label>
            <Link to="/app/settings/channels" className="inline-block text-sm text-primary hover:underline">
              Manage channels →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
