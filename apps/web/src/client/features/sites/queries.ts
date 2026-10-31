// Query options + hooks for sites. One list query feeds the sidebar, the
// switcher and every site page; mutations invalidate it.
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import type { Me, Overview, Site } from "../../lib/types";

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: () => api<Me>("/api/v1/me"),
  staleTime: 5 * 60_000,
});

/** The raw list (for loaders); `useSites`/`useSite` select from it. */
export const sitesListQuery = queryOptions({
  queryKey: ["sites"],
  queryFn: () => api<{ sites: Site[] }>("/api/v1/sites"),
});

export function useSites() {
  return useQuery({ ...sitesListQuery, select: (d) => d.sites });
}

export function useSite(siteId: string) {
  return useQuery({
    ...sitesListQuery,
    select: (d) => d.sites.find((s) => s.id === siteId) ?? null,
  });
}

export const overviewQuery = (siteId: string) =>
  queryOptions({
    queryKey: ["overview", siteId],
    queryFn: () => api<Overview>(`/api/v1/sites/${siteId}/overview`),
    refetchInterval: (q) => (q.state.data?.crawl.running ? 5_000 : 60_000),
  });

/** The current site for pages under /app/sites/$siteId. The layout route guarantees it is loaded. */
export function useCurrentSite(): Site {
  const { siteId } = useParams() as { siteId: string };
  return useSite(siteId).data!;
}
