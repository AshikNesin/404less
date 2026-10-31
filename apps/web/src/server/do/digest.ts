// DigestDurableObject: one instance per website. Buffers 404 events and flushes
// one digest per window (the site's digest_minutes, default 15) to every enabled
// channel for the team.
// SQLite-backed DO (free tier); alarms drive the flush.
import { DurableObject } from "cloudflare:workers";
import {
  buildDigest,
  sendToChannel,
  type ChannelConfig,
  type ChannelType,
  type DigestGroup,
} from "../lib/notify";
import { getMailer } from "../lib/mailer";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { alertChannels, alerts, websites } from "../db/schema";
import type { Env } from "../types";

type BufferedEvent = { url: string; ts: number; referrer: string | null };

const DEFAULT_WINDOW_MINUTES = 15;
/** Durable Object storage.delete() takes at most 128 keys per call. */
const DELETE_CHUNK = 128;

export class DigestDO extends DurableObject<Env> {
  // Storage: KV-style put/list/delete (works on any DO backend; SQLite storage
  // would also work but isn't typed/enabled consistently in test runs yet).
  private async bufferEvent(ev: {
    url: string;
    ts: number;
    referrer: string | null;
  }): Promise<void> {
    const n = (await this.ctx.storage.get<number>("n")) ?? 0;
    await this.ctx.storage.put(`e:${n}:${ev.ts}`, ev);
    await this.ctx.storage.put("n", n + 1);
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/event" && req.method === "POST") {
      const ev = (await req.json()) as { url: string; ts?: number; referrer?: string | null };
      if (!ev?.url || typeof ev.url !== "string") return new Response("bad event", { status: 400 });
      await this.bufferEvent({
        url: ev.url,
        ts: ev.ts ?? Date.now(),
        referrer: ev.referrer ?? null,
      });
      // first event of a window: arm the flush for the site's digest window
      const existing = await this.ctx.storage.getAlarm();
      if (existing == null) {
        await this.ctx.storage.setAlarm(Date.now() + (await this.windowMinutes()) * 60 * 1000);
      }
      return Response.json({ ok: true });
    }
    if (url.pathname === "/flush" && req.method === "POST") {
      await this.flush();
      return Response.json({ ok: true });
    }
    return new Response("not found", { status: 404 });
  }

  async alarm(): Promise<void> {
    await this.flush();
  }

  /** Durable Objects run outside the app's boot: their own Drizzle handle over the binding. */
  private db() {
    return drizzle(this.env.DB as never);
  }

  /** The site's digest window (digest_minutes, 5–1440), read once per window. */
  private async windowMinutes(): Promise<number> {
    const siteId = this.ctx.id.name;
    if (!siteId) return DEFAULT_WINDOW_MINUTES;
    const row = await this.db()
      .select({ minutes: websites.digest_minutes })
      .from(websites)
      .where(eq(websites.id, siteId))
      .get();
    const minutes = row?.minutes ?? DEFAULT_WINDOW_MINUTES;
    return Math.min(Math.max(minutes, 5), 1440);
  }

  private async flush(): Promise<void> {
    // The DO is addressed by name = website id (idFromName in routes).
    const siteId = this.ctx.id.name;
    if (!siteId) return;

    const entries = await this.ctx.storage.list<BufferedEvent>({ prefix: "e:" });
    const rows = [...entries.values()];
    if (!rows.length) return;

    // Load everything the send needs before dropping the buffer: if D1 fails here the
    // alarm throws and is retried with the events still buffered.
    const db = this.db();
    const site = await db
      .select({
        id: websites.id,
        name: websites.name,
        notify_enabled: websites.notify_enabled,
        digest_minutes: websites.digest_minutes,
        team_id: websites.team_id,
      })
      .from(websites)
      .where(eq(websites.id, siteId))
      .get();
    const channels = site?.notify_enabled
      ? await db
          .select({ id: alertChannels.id, type: alertChannels.type, config: alertChannels.config })
          .from(alertChannels)
          .where(and(eq(alertChannels.team_id, site.team_id), eq(alertChannels.enabled, 1)))
      : [];

    // The window is now owned by this flush. Each channel is sent once: a channel that
    // fails is logged, not retried, so channels that succeeded never get a duplicate.
    const keys = [...entries.keys()];
    for (let i = 0; i < keys.length; i += DELETE_CHUNK) {
      await this.ctx.storage.delete(keys.slice(i, i + DELETE_CHUNK));
    }
    if (!site || !site.notify_enabled) return;

    const digest = buildDigest(
      site.name,
      groupByUrl(rows),
      site.digest_minutes || DEFAULT_WINDOW_MINUTES,
    );
    const mailer = getMailer(this.env);

    for (const ch of channels) {
      let config: ChannelConfig;
      try {
        config = JSON.parse(ch.config);
      } catch {
        continue;
      }
      try {
        await sendToChannel(ch.type as ChannelType, config, digest, mailer);
        await db.insert(alerts).values({
          id: crypto.randomUUID(),
          website_id: site.id,
          channel_id: ch.id,
          summary: digest.title,
          sent_at: Date.now(),
        });
      } catch (err) {
        console.error(`digest send failed channel=${ch.id}`, err);
      }
    }
  }
}

/** Hits per URL, most-hit first, each with its most common referrer. */
function groupByUrl(rows: BufferedEvent[]): DigestGroup[] {
  const byUrl = new Map<string, { group: DigestGroup; referrers: Map<string, number> }>();
  for (const r of rows) {
    let entry = byUrl.get(r.url);
    if (!entry) {
      entry = {
        group: { url: r.url, count: 0, lastTs: 0, topReferrer: null },
        referrers: new Map(),
      };
      byUrl.set(r.url, entry);
    }
    entry.group.count++;
    entry.group.lastTs = Math.max(entry.group.lastTs, r.ts);
    if (r.referrer) entry.referrers.set(r.referrer, (entry.referrers.get(r.referrer) ?? 0) + 1);
  }
  return [...byUrl.values()]
    .map(({ group, referrers }) => {
      let top: string | null = null;
      let best = 0;
      for (const [referrer, n] of referrers) {
        if (n > best) {
          top = referrer;
          best = n;
        }
      }
      return { ...group, topReferrer: top };
    })
    .sort((a, b) => b.count - a.count);
}
