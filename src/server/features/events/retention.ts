// Retention: prune not_found_events older than the site's window.
// Defaults to 90 days; runs nightly from the scheduled() handler.
import type { Env } from '../../../types';

const DEFAULT_DAYS = 90;
const MAX_DAYS = 365;

export async function pruneEvents(env: Env): Promise<{ deleted: number }> {
  // D1 has no per-site retention column yet: use a global default from env.
  const days = Math.min(Number(env.EVENT_RETENTION_DAYS ?? DEFAULT_DAYS) || DEFAULT_DAYS, MAX_DAYS);
  const cutoff = Date.now() - days * 86_400_000;
  const res = await env.DB.prepare('DELETE FROM not_found_events WHERE ts < ?').bind(cutoff).run();
  return { deleted: res.meta.changes ?? 0 };
}
