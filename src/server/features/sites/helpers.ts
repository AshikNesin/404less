// Shared query helpers for site-scoped endpoints.
import type { Env } from '../../../types';

export type SiteRow = {
  id: string; team_id: string; name: string; domain: string; site_key: string;
  ignore_status_codes: string; exclude_patterns: string; created_at: number;
  notify_enabled: number; digest_minutes: number; crawl_enabled: number; crawl_max_pages: number;
  last_crawl_at: number | null;
};

export type TeamRole = 'owner' | 'admin' | 'viewer';

export async function siteForUser(
  env: Env, siteId: string | undefined, userId: string,
): Promise<{ site: SiteRow; role: TeamRole; status?: undefined } | { error: string; status: number }> {
  if (!siteId) return { error: 'not found', status: 404 };
  const row = await env.DB.prepare(
    `SELECT w.*, tm.role AS member_role FROM websites w
     JOIN team_members tm ON tm.team_id = w.team_id
     WHERE w.id = ? AND tm.user_id = ?`,
  ).bind(siteId, userId).first<SiteRow & { member_role: TeamRole }>();
  if (!row) return { error: 'not found', status: 404 };
  const { member_role, ...site } = row;
  return { site, role: member_role };
}

export function siteFilters(site: Pick<SiteRow, 'ignore_status_codes' | 'exclude_patterns'>): { ignore: Set<number>; excludes: string[] } {
  let ignore: number[] = [];
  let excludes: string[] = [];
  try { ignore = JSON.parse(site.ignore_status_codes ?? '[]'); } catch {}
  try { excludes = JSON.parse(site.exclude_patterns ?? '[]'); } catch {}
  return { ignore: new Set(ignore), excludes };
}
