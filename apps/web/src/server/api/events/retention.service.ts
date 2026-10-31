// Retention: prune raw visitor events and crawler check history so a self-hoster
// stays well under D1's free storage cap. broken_links rows are kept; they are
// the managed list, not a log.
import type { Env } from "../../types";
import { lt } from "drizzle-orm";
import { batch, changes, db, linkChecks, notFoundEvents } from "../../db";

const DEFAULT_DAYS = 90;
const MAX_DAYS = 365;
const CHECK_HISTORY_DAYS = 30;

export async function pruneEvents(env: Env): Promise<{ deleted: number; checksDeleted: number }> {
  const days = Math.min(Number(env.EVENT_RETENTION_DAYS ?? DEFAULT_DAYS) || DEFAULT_DAYS, MAX_DAYS);
  const now = Date.now();
  const [events, checks] = await batch([
    db.delete(notFoundEvents).where(lt(notFoundEvents.ts, now - days * 86_400_000)),
    db.delete(linkChecks).where(lt(linkChecks.checked_at, now - CHECK_HISTORY_DAYS * 86_400_000)),
  ]);
  return { deleted: changes(events), checksDeleted: changes(checks) };
}
