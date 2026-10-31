// Crawler: status + settings, known pages (sitemap import), latest results.
import { Link } from "../lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, Play, Search, X } from "lucide-react";
import { api, json, patch } from "../lib/api";
import { compact, fullTime, plural, relTime, urlLabel } from "../lib/format";
import type { CrawlRow, KnownUrl, KnownUrlStats } from "../lib/types";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { EmptyState } from "../components/ui/empty-state";
import { Field, Switch } from "../components/ui/switch";
import { HttpStatusBadge, LinkStatusBadge } from "../components/ui/status";
import { Table, TableCard, TBody, Td, Th, THead, Tr } from "../components/ui/table";
import { TableSkeleton } from "../components/ui/skeleton";
import { useToast } from "../components/ui/toast";
import { Page, PageHeader, SectionHeader } from "../components/page-header";
import { overviewQuery } from "../features/sites/queries";
import { FoundOnCell } from "../features/links/parts";
import { useCurrentSite } from "../features/sites/queries";

export function CrawlPage() {
  const site = useCurrentSite();
  const qc = useQueryClient();
  const toast = useToast();
  const overview = useQuery(overviewQuery(site.id));
  const crawl = overview.data?.crawl;
  const report = useQuery({
    queryKey: ["crawl-report", site.id],
    queryFn: () => api<{ results: CrawlRow[] }>(`/api/v1/sites/${site.id}/crawl-report?limit=100`),
    refetchInterval: crawl?.running ? 5_000 : false,
  });
  // Polling stops once the crawl ends: fetch its final results and the pages it indexed once more.
  const running = crawl?.running ?? false;
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running) {
      void qc.invalidateQueries({ queryKey: ["crawl-report", site.id] });
      void qc.invalidateQueries({ queryKey: ["known-urls", site.id] });
    }
    wasRunning.current = running;
  }, [running, qc, site.id]);

  const patchSite = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/api/v1/sites/${site.id}`, patch(body)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["sites"] }),
    onError: (e: Error) => toast("error", e.message),
  });
  const crawlNow = useMutation({
    mutationFn: () => api(`/api/v1/sites/${site.id}/crawl`, json({})),
    onSuccess: () => {
      toast("info", "Crawl started. Results appear below as links are checked.");
      void qc.invalidateQueries({ queryKey: ["overview", site.id] });
      void qc.invalidateQueries({ queryKey: ["crawl-report", site.id] });
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const [codes, setCodes] = useState("");
  const results = report.data?.results ?? [];
  const broken = results.filter((r) => r.ok === 0);

  return (
    <Page wide>
      <PageHeader
        title={
          <>
            Crawler{" "}
            {crawl?.running && (
              <Badge tone="info">
                <LoaderCircle className="animate-spin" />
                Running
              </Badge>
            )}
          </>
        }
        description="Fetches your pages, checks every link and asset it finds (redirect chains included), and re-verifies open broken links so they resolve on their own once fixed."
        actions={
          <Button
            size="sm"
            pending={crawlNow.isPending}
            disabled={crawl?.running}
            onClick={() => crawlNow.mutate()}
          >
            <Play /> Crawl now
          </Button>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Schedule &amp; budget</CardTitle>
            <CardDescription>
              {crawl?.lastCrawlAt ? (
                <>
                  Last run {relTime(crawl.lastCrawlAt)} · {plural(crawl.checked, "link")} checked ·{" "}
                  <span className={crawl.broken ? "text-destructive" : ""}>
                    {crawl.broken} broken
                  </span>
                </>
              ) : (
                "No crawl yet. Run one now or turn on the schedule."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <Field
              label="Scheduled crawling"
              hint={site.crawl_enabled ? "Runs every 30 minutes" : "Off: manual crawls only"}
            >
              <Switch
                checked={site.crawl_enabled === 1}
                label="Scheduled crawling"
                onCheckedChange={(v) => patchSite.mutate({ crawl_enabled: v })}
              />
            </Field>
            <Field
              label="Pages per crawl"
              hint="Starting pages per run (sitemap or homepage). Keeps you inside free-tier limits."
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  (e.currentTarget.elements[0] as HTMLInputElement).blur();
                }}
              >
                <Input
                  type="number"
                  min={1}
                  max={500}
                  defaultValue={site.crawl_max_pages || 100}
                  className="w-20 text-right"
                  aria-label="Pages per crawl"
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v === site.crawl_max_pages) return;
                    if (!Number.isInteger(v) || v < 1 || v > 500) {
                      toast("error", "Pages per crawl must be between 1 and 500");
                      e.target.value = String(site.crawl_max_pages);
                      return;
                    }
                    patchSite.mutate(
                      { crawl_max_pages: v },
                      {
                        onSuccess: () =>
                          toast("success", `Crawls start from up to ${plural(v, "page")}`),
                      },
                    );
                  }}
                />
              </form>
            </Field>
            <Field
              label="Treat as working"
              hint="Status codes that should not count as broken (e.g. 403 behind a login, 405 on form endpoints). 401 and 429 are always tolerated."
            >
              <form
                className="flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = Number(codes.trim());
                  if (!Number.isInteger(n) || n < 100 || n > 599) {
                    toast("error", "Enter a status code between 100 and 599");
                    return;
                  }
                  patchSite.mutate({ ignore_status_codes: [...site.ignore_status_codes, n] });
                  setCodes("");
                }}
              >
                <Input
                  value={codes}
                  onChange={(e) => setCodes(e.target.value)}
                  placeholder="403"
                  inputMode="numeric"
                  className="w-16 text-center"
                  aria-label="Status code to ignore"
                />
                <Button type="submit" variant="outline" size="sm">
                  Add
                </Button>
              </form>
            </Field>
            {site.ignore_status_codes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 py-3">
                {site.ignore_status_codes.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-foreground/[0.03] px-1.5 py-0.5 text-code"
                  >
                    {c}
                    <button
                      aria-label={`Stop ignoring ${c}`}
                      className="cursor-pointer text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        patchSite.mutate({
                          ignore_status_codes: site.ignore_status_codes.filter((x) => x !== c),
                        })
                      }
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="pt-3 text-meta">
              Excluded URL patterns from{" "}
              <Link to="/app/sites/$siteId/settings" params={{ siteId: site.id }} className="link">
                site settings
              </Link>{" "}
              are skipped by the crawler too. It respects robots.txt and identifies as{" "}
              <code className="text-code">404less-bot</code>.
            </p>
          </CardContent>
        </Card>

        <KnownPages siteId={site.id} domain={site.domain} crawling={running} />
      </div>

      <section className="space-y-3">
        <SectionHeader
          title="Latest results"
          hint={
            crawl?.lastCrawlAt
              ? `From the run started ${relTime(crawl.lastCrawlAt)}. Broken first.`
              : "Each run checks every link found; broken ones become open broken links."
          }
          action={
            crawl?.lastCrawlAt && (
              <a href={`/api/v1/sites/${site.id}/links.csv?status=open&source=crawler`}>
                <Button variant="outline" size="sm">
                  <Download /> Export broken
                </Button>
              </a>
            )
          }
        />
        <TableCard>
          {report.isPending ? (
            <TableSkeleton rows={5} cols={4} />
          ) : results.length === 0 ? (
            <EmptyState
              variant="plain"
              title={crawl?.running ? "Checking links…" : "No results yet"}
              description={
                crawl?.running
                  ? "The first checks land within a few seconds."
                  : "Run a crawl to check every link and asset on your pages."
              }
              action={
                !crawl?.running && (
                  <Button size="sm" pending={crawlNow.isPending} onClick={() => crawlNow.mutate()}>
                    <Play /> Crawl now
                  </Button>
                )
              }
            />
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>URL</Th>
                  <Th>Status</Th>
                  <Th>Linked from</Th>
                  <Th>Checked</Th>
                  <Th>Triage</Th>
                </tr>
              </THead>
              <TBody>
                {results.map((r) => (
                  <Tr key={r.url}>
                    <Td className="max-w-[28rem]">
                      {r.link_id && r.ok === 0 ? (
                        <Link
                          to="/app/sites/$siteId/links/$linkId"
                          params={{ siteId: site.id, linkId: r.link_id }}
                          className="block truncate font-medium hover:underline"
                          title={r.url}
                        >
                          {urlLabel(r.url, site.domain)}
                        </Link>
                      ) : (
                        <span className="block truncate" title={r.url}>
                          {urlLabel(r.url, site.domain)}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5">
                        <HttpStatusBadge code={r.status} />
                        {r.redirect_chain && (
                          <span className="text-meta">
                            {JSON.parse(r.redirect_chain).length - 1} hop
                            {JSON.parse(r.redirect_chain).length === 2 ? "" : "s"}
                          </span>
                        )}
                      </span>
                    </Td>
                    <Td className="max-w-[18rem]">
                      {r.found_on ? (
                        <FoundOnCell
                          anchor={r.anchor}
                          pageUrl={r.found_on}
                          pageTitle={r.found_on_title}
                          domain={site.domain}
                        />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </Td>
                    <Td
                      className="num whitespace-nowrap text-muted-foreground"
                      title={fullTime(r.checked_at)}
                    >
                      {relTime(r.checked_at)}
                    </Td>
                    <Td>
                      {r.link_status ? (
                        <LinkStatusBadge status={r.link_status} size="sm" />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
          {results.length > 0 && (
            <div className="border-t border-border px-4 py-2 text-meta">
              Showing {results.length} of the latest checks · {broken.length} broken
            </div>
          )}
        </TableCard>
      </section>
    </Page>
  );
}

function KnownPages({
  siteId,
  domain,
  crawling,
}: {
  siteId: string;
  domain: string;
  crawling: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sitemapUrl, setSitemapUrl] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const known = useQuery({
    queryKey: ["known-urls", siteId, debounced],
    queryFn: () =>
      api<{ knownUrls: KnownUrl[]; stats: KnownUrlStats }>(
        `/api/v1/sites/${siteId}/known-urls?limit=12${debounced ? `&q=${encodeURIComponent(debounced)}` : ""}`,
      ),
    placeholderData: (p) => p,
    // a crawl indexes the pages it visits, and titles arrive in the background after an
    // import: keep the list live while either is happening
    refetchInterval: (query) =>
      crawling
        ? 5_000
        : query.state.data?.knownUrls.some((k) => !k.title && !k.title_checked_at)
          ? 10_000
          : false,
  });
  const importSitemap = useMutation({
    mutationFn: () =>
      api<{ imported: number; inserted: number }>(
        `/api/v1/sites/${siteId}/import-sitemap`,
        json(sitemapUrl.trim() ? { sitemapUrl: sitemapUrl.trim() } : {}),
      ),
    onSuccess: (d) => {
      toast("success", `Imported ${compact(d.imported)} URLs (${d.inserted} new)`);
      void qc.invalidateQueries({ queryKey: ["known-urls", siteId] });
      void qc.invalidateQueries({ queryKey: ["overview", siteId] });
      void qc.invalidateQueries({ queryKey: ["links", siteId] });
    },
    onError: (e: Error) => toast("error", e.message),
  });
  const stats = known.data?.stats;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Known pages</CardTitle>
        <CardDescription>
          {stats && stats.total > 0
            ? `${compact(stats.total)} pages · ${compact(stats.titled)} with real titles · updated ${relTime(stats.last_added)}`
            : "Pages from your sitemap and crawls. They seed the crawler and power “did you mean” suggestions."}
        </CardDescription>
        {stats && stats.total > 0 && (
          <CardAction>
            <Badge tone="outline">
              {compact(stats.from_sitemap)} sitemap · {compact(stats.crawled)} crawled
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            importSitemap.mutate();
          }}
          className="flex gap-2"
        >
          <Input
            value={sitemapUrl}
            onChange={(e) => setSitemapUrl(e.target.value)}
            placeholder={`https://${domain}/sitemap.xml`}
            inputMode="url"
            aria-label="Sitemap URL"
          />
          <Button
            type="submit"
            variant="outline"
            pending={importSitemap.isPending}
            className="shrink-0"
          >
            Import sitemap
          </Button>
        </form>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search known pages…"
            className="pl-8"
            aria-label="Search known pages"
          />
        </div>
        {known.isPending ? (
          <TableSkeleton rows={4} cols={2} />
        ) : known.data && known.data.knownUrls.length > 0 ? (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {known.data.knownUrls.map((k) => (
              <li key={k.url} className="flex items-center gap-3 px-3 py-1.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.8125rem]">
                    {k.title || (
                      <span className="text-muted-foreground italic">
                        {k.title_checked_at ? "untitled" : "fetching title…"}
                      </span>
                    )}
                  </div>
                  <div className="text-meta truncate" title={k.url}>
                    {urlLabel(k.url, domain)}
                  </div>
                </div>
                <Badge tone={k.source === "crawl" ? "success" : "outline"} size="sm">
                  {k.source === "crawl" ? "crawled" : "sitemap"}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            size="sm"
            variant="plain"
            kind={debounced ? "filtered" : "no-data"}
            title={debounced ? "No matches" : "Nothing indexed yet"}
            description={
              debounced
                ? `No known pages match “${debounced}”.`
                : "Import your sitemap above, or run a crawl. It starts from the homepage."
            }
          />
        )}
      </CardContent>
    </Card>
  );
}
