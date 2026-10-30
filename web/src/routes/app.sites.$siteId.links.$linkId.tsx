// One broken link: where it comes from, what to replace it with, and the
// redirect rule to make it go away.
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Bot, MousePointerClick } from 'lucide-react';
import { compact, fullTime, hostOf, pathOf, plural, prettyUrl, relTime, urlLabel } from '../lib/format';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { BarChart } from '../components/ui/charts';
import { StatCard } from '../components/ui/stat';
import { HttpStatusBadge, LinkStatusBadge, SourceBadge } from '../components/ui/status';
import { PageSkeleton } from '../components/ui/skeleton';
import { QueryError } from '../components/ui/query-state';
import { BackLink, Page, PageHeader } from '../components/page-header';
import { linkQuery, useRecheckLink, useSetLinkStatus } from '../features/links/queries';
import { ExternalUrl, StatusActions } from '../features/links/parts';
import { RedirectSnippet } from '../features/links/redirect-snippet';
import { useCurrentSite } from '../features/sites/queries';
import { cn } from '../lib/utils';
import { ApiError } from '../lib/api';

export const Route = createFileRoute('/app/sites/$siteId/links/$linkId')({ component: LinkDetailPage });

function LinkDetailPage() {
  const site = useCurrentSite();
  const { linkId } = Route.useParams();
  const navigate = useNavigate();
  const q = useQuery(linkQuery(site.id, linkId));
  const setStatus = useSetLinkStatus(site.id);
  const recheck = useRecheckLink(site.id);
  const [fix, setFix] = useState<string | null>(null);

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) {
    return (
      <Page>
        <BackLink to="/app/sites/$siteId/links" params={{ siteId: site.id }} search={{ status: 'open', sort: 'hits', page: 1 }}>Broken links</BackLink>
        {q.error instanceof ApiError && q.error.status === 404
          ? <EmptyState kind="error" variant="card" size="sm" title="Link not found" description="It may have been removed along with its site, or the address is wrong." />
          : <QueryError error={q.error} fallback="Could not load this link" onRetry={() => void q.refetch()} isRetrying={q.isFetching} />}
      </Page>
    );
  }
  const { link, suggestions, referrers, sources, lastCheck, series, recent } = q.data;
  const chosenFix = fix ?? suggestions[0]?.url ?? null;
  const total30 = series.reduce((n, d) => n + d.hits, 0);

  return (
    <Page wide>
      <PageHeader
        backLink={<BackLink to="/app/sites/$siteId/links" params={{ siteId: site.id }} search={{ status: link.status === 'open' ? 'open' : 'all', sort: 'hits', page: 1 }}>Broken links</BackLink>}
        eyebrow="Broken link"
        title={<>
          <span className="break-all">{link.title || urlLabel(link.url, site.domain)}</span>
          <LinkStatusBadge status={link.status} />
        </>}
        description={<span className="inline-flex flex-wrap items-center gap-2">
          <ExternalUrl url={link.url} label={link.url} className="max-w-[40rem] text-muted-foreground" />
          <SourceBadge source={link.source} />
        </span>}
        actions={<StatusActions status={link.status} size="sm" pending={setStatus.isPending}
          onSet={(status) => setStatus.mutate({ ids: [link.id], status }, { onSuccess: () => { if (status !== 'open') void navigate({ to: '/app/sites/$siteId/links', params: { siteId: site.id }, search: { status: 'open', sort: 'hits', page: 1 } }); } })}
          recheck={{ onClick: () => recheck.mutate(link.id), pending: recheck.isPending }} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Visitor hits" value={compact(link.hits)} trend={series.slice(-14).map((d) => d.hits)} hint={`${compact(total30)} in the last 30 days`} />
        <StatCard label="First seen" value={relTime(link.first_seen)} hint={fullTime(link.first_seen)} />
        <StatCard label="Last seen" value={relTime(link.last_seen)} hint={fullTime(link.last_seen)} />
        <StatCard
          label="Last check"
          value={lastCheck ? <span className="inline-flex items-center gap-2"><HttpStatusBadge code={lastCheck.status} /><span className="text-base font-medium">{relTime(lastCheck.checkedAt)}</span></span> : <span className="text-base font-medium text-muted-foreground">Not checked</span>}
          hint={lastCheck ? (lastCheck.chain ? `${lastCheck.chain.length - 1} redirect hop${lastCheck.chain.length === 2 ? '' : 's'}` : 'direct response') : 'Re-check to fetch it now'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Suggested fixes</CardTitle>
              <CardDescription>Closest known pages by path similarity. Pick one to build the redirect.</CardDescription>
            </CardHeader>
            <CardContent>
              {suggestions.length === 0 ? (
                <EmptyState size="sm" variant="plain" icon={null} title="No close matches"
                  description={<>Import a sitemap or run a crawl on the <Link to="/app/sites/$siteId/crawl" params={{ siteId: site.id }} className="link">Crawler page</Link> so there are pages to match against.</>} />
              ) : (
                <ul className="-mx-4 divide-y divide-border">
                  {suggestions.map((s, i) => {
                    const active = chosenFix === s.url;
                    return (
                      <li key={s.url}>
                        <button type="button" onClick={() => setFix(s.url)} aria-pressed={active}
                          className={cn('flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-foreground/[0.025]', active && 'bg-primary/[0.04]')}>
                          <span className={cn('size-2 shrink-0 rounded-full', active ? 'bg-primary' : 'bg-border')} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.8125rem] font-medium">{s.title ?? pathOf(s.url)}</span>
                            <span className="block truncate text-meta">{prettyUrl(s.url)}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-foreground/[0.08]"><span className="block h-full rounded-full bg-chart" style={{ width: `${Math.round(s.score * 100)}%` }} /></span>
                            <span className="num w-9 text-right text-meta">{Math.round(s.score * 100)}%</span>
                            {i === 0 && <Badge tone="accent" size="sm">Best</Badge>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {chosenFix && (
            <Card>
              <CardHeader>
                <CardTitle>Redirect rule</CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-1.5">
                  <code className="text-code">{pathOf(link.url)}</code><ArrowRight className="size-3" /><code className="text-code">{pathOf(chosenFix)}</code>
                </CardDescription>
                <CardAction><a href={chosenFix} target="_blank" rel="noreferrer"><Button variant="ghost" size="xs">Open target <ArrowUpRight /></Button></a></CardAction>
              </CardHeader>
              <CardContent><RedirectSnippet fromUrl={link.url} toUrl={chosenFix} /></CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Hits per day</CardTitle>
              <CardDescription>Last 30 days, UTC.</CardDescription>
            </CardHeader>
            <CardContent><BarChart series={series} height={140} /></CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><MousePointerClick className="size-4 text-muted-foreground" /> Where visitors came from</CardTitle>
              <CardDescription>Referrers on recorded hits.</CardDescription>
            </CardHeader>
            <CardContent>
              {referrers.length === 0 ? (
                <p className="text-caption">No referrer recorded — direct visits, bookmarks, or privacy-stripped links.</p>
              ) : (
                <ul className="-mx-4 divide-y divide-border">
                  {referrers.map((r) => (
                    <li key={r.referrer} className="flex items-center gap-3 px-4 py-2">
                      <ExternalUrl url={r.referrer} label={prettyUrl(r.referrer)} className="min-w-0 flex-1 text-[0.8125rem] text-foreground" />
                      <span className="num text-meta shrink-0">{plural(r.n, 'hit')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Bot className="size-4 text-muted-foreground" /> Linked from your pages</CardTitle>
              <CardDescription>Pages the crawler found this link on. Fix these at the source.</CardDescription>
            </CardHeader>
            <CardContent>
              {sources.length === 0 ? (
                <p className="text-caption">{site.crawl_enabled || site.last_crawl_at ? 'Not found on any crawled page.' : 'Run a crawl to find which of your pages link here.'}</p>
              ) : (
                <ul className="-mx-4 divide-y divide-border">
                  {sources.map((s) => (
                    <li key={s.source_url} className="px-4 py-2">
                      <ExternalUrl url={s.source_url} label={s.source_title || urlLabel(s.source_url, site.domain)} className="text-[0.8125rem] text-foreground" />
                      <div className="text-meta truncate" title={s.source_url}>{urlLabel(s.source_url, site.domain)}{s.anchor && <> · anchor: “{s.anchor}”</>}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {lastCheck?.chain && lastCheck.chain.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Redirect chain</CardTitle>
                <CardDescription>What the crawler followed on the last check.</CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-1.5">
                  {lastCheck.chain.map((hop, i) => (
                    <li key={i} className="flex items-center gap-2 text-[0.8125rem]">
                      <HttpStatusBadge code={hop.status} size="sm" />
                      <span className="truncate" title={hop.url}>{prettyUrl(hop.url)}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Recent hits</CardTitle>
            </CardHeader>
            <CardContent>
              {recent.length === 0 ? (
                <p className="text-caption">No visitor hits recorded.</p>
              ) : (
                <ul className="-mx-4 divide-y divide-border">
                  {recent.map((e, i) => (
                    <li key={i} className="flex items-center gap-3 px-4 py-2 text-[0.8125rem]">
                      <span className="num w-16 shrink-0 text-muted-foreground" title={fullTime(e.ts)}>{relTime(e.ts)}</span>
                      <span className="min-w-0 flex-1 truncate">{e.referrer ? `from ${hostOf(e.referrer)}` : 'direct'}</span>
                      <span className="text-meta max-w-[9rem] truncate" title={e.user_agent ?? ''}>{uaLabel(e.user_agent)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function uaLabel(ua: string | null): string {
  if (!ua) return '';
  if (/bot|crawl|spider|slurp|preview/i.test(ua)) return 'bot';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}
