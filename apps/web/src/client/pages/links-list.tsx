// Broken links: the triage list. Tabs by status, search, source + sort,
// bulk actions, pagination; everything lives in the URL.
import { Link } from "../lib/router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { CircleCheck, Download, EyeOff, Search, Undo2 } from "lucide-react";
import { compact, fullTime, plural, relTime } from "../lib/format";
import type { LinkStatus } from "../lib/types";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Input, Select } from "../components/ui/input";
import { SegmentedTabs } from "../components/ui/tabs";
import { Table, TableCard, TableToolbar, TBody, Td, Th, THead, Tr } from "../components/ui/table";
import { BulkBar, TablePagination } from "../components/ui/pagination";
import { EmptyState } from "../components/ui/empty-state";
import { TableSkeleton } from "../components/ui/skeleton";
import { QueryError } from "../components/ui/query-state";
import { Page, PageHeader } from "../components/page-header";
import {
  LINKS_PAGE_SIZE,
  linksQuery,
  linksSearchParams,
  useRecheckLink,
  useSetLinkStatus,
  type LinksSearch,
} from "../features/links/queries";
import { StatusActions, SuggestionCell, UrlCell } from "../features/links/parts";
import { useCurrentSite } from "../features/sites/queries";

const STATUSES = ["open", "resolved", "ignored", "all"] as const;
const SORTS = ["hits", "last_seen", "first_seen"] as const;
const SOURCES = ["visitor", "crawler"] as const;

/** The list's state lives in the URL (?status=&q=&source=&sort=&page=), with defaults for anything missing or invalid. */
const searchParsers = {
  status: parseAsStringLiteral(STATUSES).withDefault("open"),
  q: parseAsString,
  source: parseAsStringLiteral(SOURCES),
  sort: parseAsStringLiteral(SORTS).withDefault("hits"),
  page: parseAsInteger.withDefault(1),
};

export function LinksPage() {
  const site = useCurrentSite();
  const [params, setParams] = useQueryStates(searchParsers);
  const search: LinksSearch = {
    status: params.status,
    q: params.q || undefined,
    source: params.source ?? undefined,
    sort: params.sort,
    page: Math.max(1, params.page),
  };
  // any filter change goes back to page 1; an undefined value clears that param
  const update = (patch: Partial<LinksSearch>) => {
    const next: Partial<Record<keyof LinksSearch, unknown>> = { page: 1 };
    for (const [key, value] of Object.entries(patch))
      next[key as keyof LinksSearch] = value ?? null;
    void setParams(next as Parameters<typeof setParams>[0], { history: "replace" });
  };

  const query = useQuery(linksQuery(site.id, search));
  const setStatus = useSetLinkStatus(site.id);
  const recheck = useRecheckLink(site.id);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState(search.q ?? "");
  useEffect(() => {
    setQ(search.q ?? "");
  }, [search.q]);
  useEffect(() => {
    const t = setTimeout(() => {
      if ((q || undefined) !== search.q) update({ q: q || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  useEffect(() => setSelected(new Set()), [search.status, search.page, search.q, search.source]);

  const data = query.data;
  const rows = data?.links ?? [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = rows.some((r) => selected.has(r.id));
  const selectedStatus = useMemo<LinkStatus | "mixed">(() => {
    const st = new Set(rows.filter((r) => selected.has(r.id)).map((r) => r.status));
    return st.size === 1 ? [...st][0] : "mixed";
  }, [rows, selected]);

  const bulk = (status: LinkStatus) => {
    setStatus.mutate({ ids: [...selected], status }, { onSuccess: () => setSelected(new Set()) });
  };
  const counts = data?.counts ?? { open: 0, resolved: 0, ignored: 0 };
  const csvHref = `/api/v1/sites/${site.id}/links.csv?${linksSearchParams(search)}`;

  return (
    <Page wide>
      <PageHeader
        title="Broken links"
        description="Every URL that visitors or the crawler hit without success. Resolve what you’ve fixed, ignore what’s noise. The crawler reopens anything that breaks again."
        actions={
          <a href={csvHref}>
            <Button variant="outline" size="sm">
              <Download /> Export CSV
            </Button>
          </a>
        }
      />

      <TableCard>
        <TableToolbar
          actions={
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search URLs…"
                  className="w-56 pl-8"
                  aria-label="Search URLs"
                />
              </div>
              <Select
                value={search.source ?? ""}
                onChange={(e) =>
                  update({ source: (e.target.value || undefined) as LinksSearch["source"] })
                }
                aria-label="Detected by"
              >
                <option value="">All sources</option>
                <option value="visitor">Visitors</option>
                <option value="crawler">Crawler</option>
              </Select>
              <Select
                value={search.sort}
                onChange={(e) => update({ sort: e.target.value as LinksSearch["sort"] })}
                aria-label="Sort"
              >
                <option value="hits">Most hits</option>
                <option value="last_seen">Last seen</option>
                <option value="first_seen">Newest</option>
              </Select>
            </>
          }
        >
          <SegmentedTabs
            value={search.status}
            onChange={(status) => update({ status })}
            items={[
              { value: "open", label: "Open", count: counts.open },
              { value: "resolved", label: "Resolved", count: counts.resolved },
              { value: "ignored", label: "Ignored", count: counts.ignored },
              { value: "all", label: "All" },
            ]}
          />
        </TableToolbar>

        {query.isPending ? (
          <TableSkeleton rows={6} cols={5} />
        ) : query.isError && !data ? (
          <div className="p-4">
            <QueryError
              error={query.error}
              fallback="Could not load broken links"
              onRetry={() => void query.refetch()}
              isRetrying={query.isFetching}
            />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            variant="plain"
            kind={search.q || search.source ? "filtered" : "no-data"}
            title={
              search.q || search.source
                ? "No links match these filters"
                : search.status === "open"
                  ? "No open broken links"
                  : `No ${search.status === "all" ? "" : search.status} links yet`
            }
            description={
              search.q || search.source
                ? "Try a broader search or clear the source filter."
                : search.status === "open"
                  ? site.last_hit_at
                    ? "Everything reported so far is resolved or ignored. Nice."
                    : "Install the snippet on your 404 page or run a crawl to start finding them."
                  : "Links you mark will show up here."
            }
            action={
              (search.q || search.source) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setQ("");
                    update({ q: undefined, source: undefined });
                  }}
                >
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th className="w-8 pr-0">
                  <Checkbox
                    aria-label="Select all"
                    checked={allSelected}
                    indeterminate={someSelected && !allSelected}
                    onCheckedChange={(checked) =>
                      setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set())
                    }
                  />
                </Th>
                <Th>URL</Th>
                <Th className="text-right">Hits</Th>
                <Th>Found on</Th>
                <Th>Suggested fix</Th>
                <Th>{search.sort === "first_seen" ? "First seen" : "Last seen"}</Th>
                <Th className="w-px">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((l) => {
                const isSel = selected.has(l.id);
                return (
                  <Tr key={l.id} data-selected={isSel}>
                    <Td className="pr-0">
                      <Checkbox
                        aria-label={`Select ${l.url}`}
                        checked={isSel}
                        onCheckedChange={(checked) =>
                          setSelected((s) => {
                            const n = new Set(s);
                            if (checked) n.add(l.id);
                            else n.delete(l.id);
                            return n;
                          })
                        }
                      />
                    </Td>
                    <Td className="max-w-[26rem] min-w-[14rem]">
                      <UrlCell
                        url={l.url}
                        domain={site.domain}
                        httpStatus={l.http_status}
                        source={l.source}
                        title={l.title}
                        to="/app/sites/$siteId/links/$linkId"
                        params={{ siteId: site.id, linkId: l.id }}
                      />
                    </Td>
                    <Td className="num text-right font-medium">
                      {l.hits ? compact(l.hits) : <span className="text-muted-foreground">-</span>}
                    </Td>
                    <Td className="max-w-[12rem]">
                      {l.source_pages > 0 ? (
                        <Link
                          to="/app/sites/$siteId/links/$linkId"
                          params={{ siteId: site.id, linkId: l.id }}
                          className="hover:underline"
                        >
                          {plural(l.source_pages, "page")}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </Td>
                    <Td className="max-w-[16rem]">
                      <SuggestionCell
                        url={l.suggested_url}
                        title={l.suggested_title}
                        domain={site.domain}
                      />
                    </Td>
                    <Td
                      className="num whitespace-nowrap text-muted-foreground"
                      title={fullTime(search.sort === "first_seen" ? l.first_seen : l.last_seen)}
                    >
                      {relTime(search.sort === "first_seen" ? l.first_seen : l.last_seen)}
                    </Td>
                    <Td className="pl-0">
                      <div className="reveal-on-hover flex justify-end">
                        <StatusActions
                          status={l.status}
                          size="xs"
                          showLabels={false}
                          pending={setStatus.isPending}
                          onSet={(status) => setStatus.mutate({ ids: [l.id], status })}
                          recheck={{
                            onClick: () => recheck.mutate(l.id),
                            pending: recheck.isPending && recheck.variables === l.id,
                          }}
                        />
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
        {data && (
          <TablePagination
            page={search.page}
            pageSize={LINKS_PAGE_SIZE}
            total={data.total}
            isLoading={query.isFetching}
            onPageChange={(page) => void setParams({ page }, { history: "push" })}
          />
        )}
      </TableCard>

      <BulkBar count={selected.size} label="selected" onClear={() => setSelected(new Set())}>
        {selectedStatus !== "resolved" && (
          <Button
            variant="ghost"
            size="sm"
            pending={setStatus.isPending}
            onClick={() => bulk("resolved")}
          >
            <CircleCheck /> Resolve
          </Button>
        )}
        {selectedStatus !== "ignored" && (
          <Button
            variant="ghost"
            size="sm"
            pending={setStatus.isPending}
            onClick={() => bulk("ignored")}
          >
            <EyeOff /> Ignore
          </Button>
        )}
        {selectedStatus !== "open" && (
          <Button
            variant="ghost"
            size="sm"
            pending={setStatus.isPending}
            onClick={() => bulk("open")}
          >
            <Undo2 /> Reopen
          </Button>
        )}
      </BulkBar>
    </Page>
  );
}
