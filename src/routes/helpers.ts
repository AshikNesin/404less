// Shared query helpers for site-scoped endpoints.
import type { Env } from '../types';

export type SiteRow = {
  id: string; team_id: string; name: string; domain: string; site_key: string;
  ignore_status_codes: string; exclude_patterns: string; created_at: number;
};

export async function siteForUser(
  env: Env, siteId: string | undefined, userId: string,
): Promise<{ site: SiteRow; status?: undefined } | { error: string; status: number }> {
  if (!siteId) return { error: 'not found', status: 404 };
  const site = await env.DB.prepare(
    `SELECT w.* FROM websites w
     JOIN team_members tm ON tm.team_id = w.team_id
     WHERE w.id = ? AND tm.user_id = ?`,
  ).bind(siteId, userId).first<SiteRow>();
  if (!site) return { error: 'not found', status: 404 };
  return { site };
}

export function siteFilters(site: SiteRow): { ignore: Set<number>; excludes: string[] } {
  let ignore: number[] = [];
  let excludes: string[] = [];
  try { ignore = JSON.parse(site.ignore_status_codes ?? '[]'); } catch {}
  try { excludes = JSON.parse(site.exclude_patterns ?? '[]'); } catch {}
  return { ignore: new Set(ignore), excludes };
}
