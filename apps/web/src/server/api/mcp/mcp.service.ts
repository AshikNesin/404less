// MCP tool implementations (read-only), shared by the streamable-HTTP endpoint.
// All tools scope strictly to the authenticated team's sites.
import type { Env } from "../../types";
import { LINK_STATUSES, suggestFor, type LinkStatus } from "../links/links.service";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, type SQL } from "drizzle-orm";
import {
  batch,
  brokenLinks,
  crawlSources,
  db,
  linkChecks,
  notFoundEvents,
  websites,
} from "../../db";

export type TeamSite = { id: string; name: string; domain: string; site_key: string };

export async function teamSites(env: Env, teamId: string): Promise<TeamSite[]> {
  return db
    .select({
      id: websites.id,
      name: websites.name,
      domain: websites.domain,
      site_key: websites.site_key,
    })
    .from(websites)
    .where(eq(websites.team_id, teamId))
    .orderBy(asc(websites.created_at));
}

async function resolveSite(env: Env, teamId: string, site: string): Promise<TeamSite | null> {
  // accept site id, domain, or name (case-insensitive)
  const sites = await teamSites(env, teamId);
  const s = site.toLowerCase();
  return (
    sites.find(
      (x) => x.id === site || x.domain.toLowerCase() === s || x.name.toLowerCase() === s,
    ) ?? null
  );
}

const iso = (t: number | null | undefined) => (t ? new Date(t).toISOString() : null);

export async function listBrokenLinks(
  env: Env,
  teamId: string,
  args: {
    site: string;
    status?: string;
    since?: string;
    limit?: number;
  },
) {
  const st = await resolveSite(env, teamId, args.site);
  if (!st) return { error: `unknown site "${args.site}"` };
  const limit = Math.min(args.limit ?? 50, 200);
  const status: LinkStatus | "all" = (LINK_STATUSES as readonly string[]).includes(
    args.status ?? "",
  )
    ? (args.status as LinkStatus)
    : args.status === "all"
      ? "all"
      : "open";
  const sinceMs = args.since ? Date.parse(args.since) : NaN;

  const where: SQL[] = [eq(brokenLinks.website_id, st.id)];
  if (status !== "all") where.push(eq(brokenLinks.status, status));
  if (!Number.isNaN(sinceMs)) where.push(gte(brokenLinks.last_seen, sinceMs));
  const rows = await db
    .select({
      url: brokenLinks.url,
      status: brokenLinks.status,
      source: brokenLinks.source,
      hits: brokenLinks.hits,
      http_status: brokenLinks.http_status,
      title: brokenLinks.title,
      first_seen: brokenLinks.first_seen,
      last_seen: brokenLinks.last_seen,
      suggested_url: brokenLinks.suggested_url,
      suggested_title: brokenLinks.suggested_title,
    })
    .from(brokenLinks)
    .where(and(...where))
    .orderBy(desc(brokenLinks.hits), desc(brokenLinks.last_seen))
    .limit(limit);
  return {
    site: st.domain,
    status,
    broken_links: rows.map((r) => ({
      url: r.url,
      title: r.title,
      status: r.status,
      detected_by: r.source,
      hits: r.hits,
      http_status: r.http_status,
      first_seen: iso(r.first_seen),
      last_seen: iso(r.last_seen),
      suggested_fix: r.suggested_url ? { url: r.suggested_url, title: r.suggested_title } : null,
    })),
  };
}

export async function getSuggestions(
  env: Env,
  teamId: string,
  args: { site: string; url: string },
) {
  const st = await resolveSite(env, teamId, args.site);
  if (!st) return { error: `unknown site "${args.site}"` };
  return { site: st.domain, suggestions: await suggestFor(env, st.id, args.url, 5) };
}

export async function listSites(env: Env, teamId: string) {
  const sites = await teamSites(env, teamId);
  if (!sites.length) return { sites: [] };
  const counts = await db
    .select({ website_id: brokenLinks.website_id, n: count() })
    .from(brokenLinks)
    .where(
      and(
        eq(brokenLinks.status, "open"),
        inArray(
          brokenLinks.website_id,
          sites.map((s) => s.id),
        ),
      ),
    )
    .groupBy(brokenLinks.website_id);
  const open = new Map(counts.map((r) => [r.website_id, r.n]));
  return {
    sites: sites.map((s) => ({
      id: s.id,
      name: s.name,
      domain: s.domain,
      open_broken_links: open.get(s.id) ?? 0,
    })),
  };
}

export async function getLinkDetails(
  env: Env,
  teamId: string,
  args: { site: string; url: string },
) {
  const st = await resolveSite(env, teamId, args.site);
  if (!st) return { error: `unknown site "${args.site}"` };
  const link = await db
    .select()
    .from(brokenLinks)
    .where(and(eq(brokenLinks.website_id, st.id), eq(brokenLinks.url, args.url)))
    .get();
  const [referrers, sources, check] = await batch([
    db
      .select({ referrer: notFoundEvents.referrer, n: count() })
      .from(notFoundEvents)
      .where(
        and(
          eq(notFoundEvents.website_id, st.id),
          eq(notFoundEvents.url, args.url),
          isNotNull(notFoundEvents.referrer),
        ),
      )
      .groupBy(notFoundEvents.referrer)
      .orderBy(desc(count()))
      .limit(10),
    db
      .select({
        source_url: crawlSources.source_url,
        source_title: crawlSources.source_title,
        anchor: crawlSources.anchor,
      })
      .from(crawlSources)
      .where(and(eq(crawlSources.website_id, st.id), eq(crawlSources.target_url, args.url)))
      .limit(25),
    db
      .select({
        status: linkChecks.status,
        redirect_chain: linkChecks.redirect_chain,
        checked_at: linkChecks.checked_at,
      })
      .from(linkChecks)
      .where(and(eq(linkChecks.website_id, st.id), eq(linkChecks.url, args.url)))
      .orderBy(desc(linkChecks.checked_at))
      .limit(1),
  ]);
  const lastCheck = check[0];
  return {
    site: st.domain,
    url: args.url,
    status: link?.status ?? null,
    detected_by: link?.source ?? null,
    hits: link?.hits ?? 0,
    http_status: link?.http_status ?? null,
    title: link?.title ?? null,
    first_seen: iso(link?.first_seen),
    last_seen: iso(link?.last_seen),
    resolved_at: iso(link?.resolved_at),
    last_check: lastCheck
      ? {
          status: lastCheck.status,
          checked_at: iso(lastCheck.checked_at),
          redirect_chain: lastCheck.redirect_chain ? JSON.parse(lastCheck.redirect_chain) : null,
        }
      : null,
    top_referrers: referrers,
    found_on_pages: sources,
    suggested_fixes: await suggestFor(env, st.id, args.url, 5),
  };
}
