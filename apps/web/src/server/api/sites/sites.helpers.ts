// Shared query helpers for site-scoped endpoints.
import type { Env } from "../../types";
import { and, eq, getTableColumns } from "drizzle-orm";
import { db, teamMembers, websites } from "../../db";

export type SiteRow = {
  id: string;
  team_id: string;
  name: string;
  domain: string;
  site_key: string;
  ignore_status_codes: string;
  exclude_patterns: string;
  created_at: number;
  notify_enabled: number;
  digest_minutes: number;
  crawl_enabled: number;
  crawl_max_pages: number;
  last_crawl_at: number | null;
};

export type TeamRole = "owner" | "admin" | "viewer";

export async function siteForUser(
  env: Env,
  siteId: string | undefined,
  userId: string,
): Promise<
  { site: SiteRow; role: TeamRole; status?: undefined } | { error: string; status: number }
> {
  if (!siteId) return { error: "not found", status: 404 };
  const row = await db
    .select({ ...getTableColumns(websites), member_role: teamMembers.role })
    .from(websites)
    .innerJoin(teamMembers, eq(teamMembers.team_id, websites.team_id))
    .where(and(eq(websites.id, siteId), eq(teamMembers.user_id, userId)))
    .get();
  if (!row) return { error: "not found", status: 404 };
  const { member_role, ...site } = row;
  return { site, role: member_role as TeamRole };
}

export function siteFilters(site: Pick<SiteRow, "ignore_status_codes" | "exclude_patterns">): {
  ignore: Set<number>;
  excludes: string[];
} {
  let ignore: number[] = [];
  let excludes: string[] = [];
  try {
    ignore = JSON.parse(site.ignore_status_codes ?? "[]");
  } catch {}
  try {
    excludes = JSON.parse(site.exclude_patterns ?? "[]");
  } catch {}
  return { ignore: new Set(ignore), excludes };
}
