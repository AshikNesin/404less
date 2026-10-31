// DigestDurableObject: one instance per website. Buffers 404 events and flushes
// one digest per window (default 15 min) to every enabled channel for the team.
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
      // ensure a flush alarm exists
      const existing = await this.ctx.storage.getAlarm();
      if (existing == null) await this.ctx.storage.setAlarm(Date.now() + 15 * 60 * 1000);
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

  private async flush(): Promise<void> {
    // The DO is addressed by name = website id (idFromName in routes).
    const siteId = this.ctx.id.name;
    if (!siteId) return;

    const entries = await this.ctx.storage.list<BufferedEvent>({ prefix: "e:" });
    const rows = [...entries.values()];
    if (!rows.length) return;
    await this.ctx.storage.delete([...entries.keys()]);

    // Durable Objects run outside the app's boot: their own Drizzle handle over the binding.
    const db = drizzle(this.env.DB as never);
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
    if (!site || !site.notify_enabled) return;

    const byUrl = new Map<string, DigestGroup>();
    for (const r of rows) {
      const g = byUrl.get(r.url) ?? { url: r.url, count: 0, lastTs: 0, topReferrer: r.referrer };
      g.count++;
      g.lastTs = Math.max(g.lastTs, r.ts);
      byUrl.set(r.url, g);
    }
    const groups = [...byUrl.values()].sort((a, b) => b.count - a.count).slice(0, 20);
    const digest = buildDigest(site.name, groups, site.digest_minutes || 15);

    const channels = await db
      .select({ id: alertChannels.id, type: alertChannels.type, config: alertChannels.config })
      .from(alertChannels)
      .where(and(eq(alertChannels.team_id, site.team_id), eq(alertChannels.enabled, 1)));
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
