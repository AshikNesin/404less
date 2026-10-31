// Broken-link queries + mutations. Status changes invalidate everything that
// shows counts (the list, the overview, the sidebar badge).
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, json, patch } from "../../lib/api";
import type { LinkDetail, LinkStatus, LinksPage } from "../../lib/types";
import { useToast } from "../../components/ui/toast";

export type LinksSearch = {
  status: LinkStatus | "all";
  q?: string;
  source?: "visitor" | "crawler";
  sort: "hits" | "last_seen" | "first_seen";
  page: number;
};

export const LINKS_PAGE_SIZE = 25;

export function linksSearchParams(s: LinksSearch): string {
  const p = new URLSearchParams();
  p.set("status", s.status);
  if (s.q) p.set("q", s.q);
  if (s.source) p.set("source", s.source);
  p.set("sort", s.sort);
  p.set("page", String(s.page));
  p.set("limit", String(LINKS_PAGE_SIZE));
  return p.toString();
}

export const linksQuery = (siteId: string, s: LinksSearch) =>
  queryOptions({
    queryKey: ["links", siteId, s],
    queryFn: () => api<LinksPage>(`/api/v1/sites/${siteId}/links?${linksSearchParams(s)}`),
    placeholderData: (prev) => prev,
  });

export const linkQuery = (siteId: string, linkId: string) =>
  queryOptions({
    queryKey: ["link", siteId, linkId],
    queryFn: () => api<LinkDetail>(`/api/v1/sites/${siteId}/links/${linkId}`),
  });

export function useInvalidateLinks(siteId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["links", siteId] });
    void qc.invalidateQueries({ queryKey: ["link", siteId] });
    void qc.invalidateQueries({ queryKey: ["overview", siteId] });
    void qc.invalidateQueries({ queryKey: ["crawl-report", siteId] });
    void qc.invalidateQueries({ queryKey: ["sites"] });
  };
}

const VERB: Record<LinkStatus, string> = {
  open: "Reopened",
  resolved: "Resolved",
  ignored: "Ignored",
};

export function useSetLinkStatus(siteId: string) {
  const toast = useToast();
  const invalidate = useInvalidateLinks(siteId);
  return useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: LinkStatus }) =>
      api<{ changed: number }>(`/api/v1/sites/${siteId}/links`, patch({ ids, status })),
    onSuccess: (d, { status }) => {
      toast("success", `${VERB[status]} ${d.changed === 1 ? "1 link" : `${d.changed} links`}`);
      invalidate();
    },
    onError: (e: Error) => toast("error", e.message),
  });
}

export function useRecheckLink(siteId: string) {
  const toast = useToast();
  const invalidate = useInvalidateLinks(siteId);
  return useMutation({
    mutationFn: (linkId: string) =>
      api<{ httpStatus: number; ok: boolean; status: LinkStatus | null }>(
        `/api/v1/sites/${siteId}/links/${linkId}/check`,
        json({}),
      ),
    onSuccess: (r) => {
      toast(
        r.ok ? "success" : "info",
        r.ok
          ? `Responds with ${r.httpStatus} now — marked resolved`
          : `Still broken (${r.httpStatus || "no response"})`,
      );
      invalidate();
    },
    onError: (e: Error) => toast("error", e.message),
  });
}
