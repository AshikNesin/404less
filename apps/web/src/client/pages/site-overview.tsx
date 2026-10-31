// Site overview — leads with what needs attention, then the trend, then activity.
import { Link } from "../lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight, Bot, LoaderCircle, Play, Settings } from "lucide-react";
import { api, json } from "../lib/api";
import { compact, dayLabel, fullTime, hostOf, pathOf, plural, relTime } from "../lib/format";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { EmptyState } from "../components/ui/empty-state";
import { BarChart } from "../components/ui/charts";
import { StatCard, percentChange } from "../components/ui/stat";
import { PageSkeleton } from "../components/ui/skeleton";
import { QueryError } from "../components/ui/query-state";
import { useToast } from "../components/ui/toast";
import { Page, PageHeader } from "../components/page-header";
import { overviewQuery } from "../features/sites/queries";
import { SetupChecklist } from "../features/sites/setup-checklist";
import { VerifyInstall } from "../features/sites/verify-install";
import { SuggestionCell, UrlCell } from "../features/links/parts";
import { useCurrentSite } from "../features/sites/queries";

export function OverviewPage() {
  const site = useCurrentSite();
  const qc = useQueryClient();
  const toast = useToast();
  const overview = useQuery(overviewQuery(site.id));
  const crawlNow = useMutation({
    mutationFn: () => api(`/api/v1/sites/${site.id}/crawl`, json({})),
    onSuccess: () => {
      toast("info", "Crawl started — results land on the Crawler page as links are checked");
      void qc.invalidateQueries({ queryKey: ["overview", site.id] });
    },
    onError: (e: Error) => toast("error", e.message),
  });

  if (overview.isPending) return <PageSkeleton />;
  if (overview.isError) {
    return (
      <Page>
        <QueryError
          error={overview.error}
          fallback="Could not load this site’s overview"
          onRetry={() => void overview.refetch()}
          isRetrying={overview.isFetching}
        />
      </Page>
    );
  }
  const o = overview.data;
  const tracking = site.last_hit_at !== null && Date.now() - site.last_hit_at < 7 * 86_400_000;
  const delta = percentChange(o.hits7d, o.hitsPrev7d);
  const total30 = o.series.reduce((n, d) => n + d.hits, 0);
  const trend14 = o.series.slice(-14).map((d) => d.hits);

  return (
    <Page>
      <PageHeader
        eyebrow="Your site"
        title={
          <>
            {site.name}
            {tracking ? (
              <Badge tone="success" dot>
                Tracking live
              </Badge>
            ) : (
              <Badge tone="outline" dot>
                No hits yet
              </Badge>
            )}
            {o.crawl.running && (
              <Badge tone="info">
                <LoaderCircle className="animate-spin" />
                Crawling
              </Badge>
            )}
          </>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <a
              href={`https://${site.domain}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 hover:text-foreground"
            >
              {site.domain}
              <ArrowUpRight className="size-3" />
            </a>
            <span>·</span>
            <span>
              monitoring since{" "}
              {new Date(site.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </span>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              pending={crawlNow.isPending}
              disabled={o.crawl.running}
              onClick={() => crawlNow.mutate()}
            >
              <Play /> {o.crawl.running ? "Crawling…" : "Crawl now"}
            </Button>
            <Link to="/app/sites/$siteId/settings" params={{ siteId: site.id }}>
              <Button variant="outline" size="sm">
                <Settings /> Settings
              </Button>
            </Link>
          </>
        }
      />

      <SetupChecklist site={site} overview={o} />
      <VerifyInstall site={site} overview={o} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Open broken links"
          value={o.counts.open.toLocaleString()}
          tone={o.counts.open > 0 ? "destructive" : "default"}
          hint={`${o.counts.resolved.toLocaleString()} resolved · ${o.counts.ignored.toLocaleString()} ignored`}
        />
        <StatCard
          label="404 hits, last 7 days"
          value={compact(o.hits7d)}
          trend={trend14}
          delta={
            delta === null ? null : { value: delta, period: "previous 7 days", upIsGood: false }
          }
          hint={delta === null ? "no hits in the previous 7 days" : undefined}
        />
        <StatCard
          label="Visitor hits, last 30 days"
          value={compact(total30)}
          hint={`${plural(o.counts.open + o.counts.resolved + o.counts.ignored, "unique URL")} tracked`}
        />
        <StatCard
          label="Last crawl"
          value={
            o.crawl.running
              ? "Running"
              : o.crawl.lastCrawlAt
                ? relTime(o.crawl.lastCrawlAt)
                : "Never"
          }
          tone={o.crawl.broken > 0 && !o.crawl.running ? "destructive" : "default"}
          hint={
            o.crawl.lastCrawlAt
              ? `${plural(o.crawl.checked, "link")} checked · ${o.crawl.broken} broken`
              : site.crawl_enabled
                ? "scheduled every 30 min"
                : "crawler is off"
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>404 hits per day</CardTitle>
          <CardDescription>
            Last 30 days, UTC. Visitor hits reported by the snippet.
          </CardDescription>
          <CardAction className="sm:text-right">
            <div className="text-metric">{compact(total30)}</div>
            <div className="text-meta">
              {dayLabel(o.series[0].day)} – {dayLabel(o.series[o.series.length - 1].day)}
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          <BarChart series={o.series} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>Open links ordered by visitor impact.</CardDescription>
            <CardAction>
              <Link
                to="/app/sites/$siteId/links"
                params={{ siteId: site.id }}
                search={{ status: "open", sort: "hits", page: 1 }}
              >
                <Button variant="ghost" size="sm">
                  View all <ArrowRight />
                </Button>
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {o.topOpen.length === 0 ? (
              <EmptyState
                size="sm"
                variant="plain"
                icon={null}
                title="Nothing open right now"
                description={
                  tracking
                    ? "Every reported URL is resolved or ignored."
                    : "Install the snippet or run a crawl to find broken links."
                }
              />
            ) : (
              <ul className="-mx-4 divide-y divide-border">
                {o.topOpen.map((l) => (
                  <li
                    key={l.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-2.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]"
                  >
                    <UrlCell
                      url={l.url}
                      domain={site.domain}
                      httpStatus={l.http_status ?? undefined}
                      source={l.source}
                      title={l.title}
                      to="/app/sites/$siteId/links/$linkId"
                      params={{ siteId: site.id, linkId: l.id }}
                      className="col-start-1 row-start-1 sm:col-auto sm:row-auto"
                    />
                    <div className="col-span-2 row-start-2 min-w-0 text-[0.8125rem] sm:col-span-1 sm:row-auto">
                      <div className="text-meta sm:hidden">Suggested fix</div>
                      <SuggestionCell
                        url={l.suggested_url}
                        title={l.suggested_title}
                        domain={site.domain}
                      />
                    </div>
                    <div className="col-start-2 row-start-1 text-right sm:col-auto sm:row-auto">
                      <div className="num text-[0.8125rem] font-semibold">
                        {compact(l.hits)}
                        <span className="text-meta font-normal">
                          {" "}
                          {l.hits === 1 ? "hit" : "hits"}
                        </span>
                      </div>
                      <div className="text-meta" title={fullTime(l.last_seen)}>
                        {relTime(l.last_seen)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest visitor hits, newest first.</CardDescription>
          </CardHeader>
          <CardContent>
            {o.recent.length === 0 ? (
              <EmptyState
                size="sm"
                variant="plain"
                icon={null}
                title="No hits yet"
                description="Visitor 404s appear here as they happen."
              />
            ) : (
              <ul className="-mx-4 divide-y divide-border">
                {o.recent.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[0.8125rem]" title={e.url}>
                        {pathOf(e.url)}
                      </div>
                      <div className="text-meta truncate">
                        {e.referrer ? <>from {hostOf(e.referrer)}</> : "direct / unknown referrer"}
                      </div>
                    </div>
                    <span className="text-meta shrink-0" title={fullTime(e.ts)}>
                      {relTime(e.ts)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {!site.crawl_enabled && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-meta">
                <Bot className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  The crawler is off. Turn it on from the{" "}
                  <Link to="/app/sites/$siteId/crawl" params={{ siteId: site.id }} className="link">
                    Crawler page
                  </Link>{" "}
                  to catch broken links before visitors do.
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
