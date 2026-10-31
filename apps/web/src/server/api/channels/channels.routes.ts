// Team notification channels (Slack / Pushover / email) + alert history + CSV export.
import { Hono } from "hono";
import { newId, now } from "../../lib/auth";
import { validateChannelConfig, type ChannelType } from "../../lib/notify";
import type { Env } from "../../types";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { alertChannels, alerts, batch, db, teamMembers, websites } from "../../db";

export const channels = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

async function teamRole(
  env: Env,
  teamId: string | undefined,
  userId: string,
): Promise<"owner" | "admin" | "viewer" | null> {
  if (!teamId) return null;
  const row = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.team_id, teamId), eq(teamMembers.user_id, userId)))
    .get();
  return (row?.role as "owner" | "admin" | "viewer" | undefined) ?? null;
}

// list channels for a team
channels.get("/teams/:teamId/channels", async (c) => {
  const role = await teamRole(c.env, c.req.param("teamId"), c.get("userId"));
  if (!role) return c.json({ error: "not found" }, 404);
  const rows = await db
    .select({
      id: alertChannels.id,
      type: alertChannels.type,
      name: alertChannels.name,
      enabled: alertChannels.enabled,
      created_at: alertChannels.created_at,
    })
    .from(alertChannels)
    .where(eq(alertChannels.team_id, c.req.param("teamId")))
    .orderBy(asc(alertChannels.created_at));
  // never return secrets
  return c.json({ channels: rows });
});

// create channel (config stored once, never returned)
channels.post("/teams/:teamId/channels", async (c) => {
  const teamId = c.req.param("teamId");
  const role = await teamRole(c.env, teamId, c.get("userId"));
  if (!role) return c.json({ error: "not found" }, 404);
  if (role === "viewer") return c.json({ error: "viewers cannot manage channels" }, 403);

  const body = await c.req.json().catch(() => ({}));
  const type = body?.type as ChannelType;
  if (!["slack", "pushover", "email"].includes(type)) return c.json({ error: "invalid type" }, 400);
  const config = validateChannelConfig(type, body?.config);
  if (!config) return c.json({ error: "invalid config for " + type }, 400);
  const name =
    typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, 100) : type;

  const id = newId();
  await db.insert(alertChannels).values({
    id,
    team_id: teamId,
    type,
    name,
    config: JSON.stringify(config),
    enabled: 1,
    created_at: now(),
  });
  return c.json({ channel: { id, type, name, enabled: 1 } }, 201);
});

// enable/disable or delete
channels.patch("/teams/:teamId/channels/:id", async (c) => {
  const teamId = c.req.param("teamId");
  const role = await teamRole(c.env, teamId, c.get("userId"));
  if (!role) return c.json({ error: "not found" }, 404);
  if (role === "viewer") return c.json({ error: "viewers cannot manage channels" }, 403);
  const body = await c.req.json().catch(() => ({}));
  if (typeof body?.enabled === "boolean") {
    await db
      .update(alertChannels)
      .set({ enabled: body.enabled ? 1 : 0 })
      .where(and(eq(alertChannels.id, c.req.param("id")), eq(alertChannels.team_id, teamId)));
  }
  return c.json({ ok: true });
});

channels.delete("/teams/:teamId/channels/:id", async (c) => {
  const teamId = c.req.param("teamId");
  const role = await teamRole(c.env, teamId, c.get("userId"));
  if (!role) return c.json({ error: "not found" }, 404);
  if (role === "viewer") return c.json({ error: "viewers cannot manage channels" }, 403);
  // its alert history goes too (alerts.channel_id references it, and history is shown per channel)
  const ownChannel = and(
    eq(alertChannels.id, c.req.param("id")),
    eq(alertChannels.team_id, teamId),
  );
  await batch([
    db
      .delete(alerts)
      .where(
        inArray(
          alerts.channel_id,
          db.select({ id: alertChannels.id }).from(alertChannels).where(ownChannel),
        ),
      ),
    db.delete(alertChannels).where(ownChannel),
  ]);
  return c.json({ ok: true });
});

// recent alert history for a site
channels.get("/sites/:id/alerts", async (c) => {
  const site = await db
    .select({ id: websites.id })
    .from(websites)
    .innerJoin(teamMembers, eq(teamMembers.team_id, websites.team_id))
    .where(and(eq(websites.id, c.req.param("id")), eq(teamMembers.user_id, c.get("userId"))))
    .get();
  if (!site) return c.json({ error: "not found" }, 404);
  const rows = await db
    .select({
      id: alerts.id,
      summary: alerts.summary,
      sent_at: alerts.sent_at,
      channel_type: alertChannels.type,
      channel_name: alertChannels.name,
    })
    .from(alerts)
    .innerJoin(alertChannels, eq(alertChannels.id, alerts.channel_id))
    .where(eq(alerts.website_id, c.req.param("id")))
    .orderBy(desc(alerts.sent_at))
    .limit(50);
  return c.json({ alerts: rows });
});

// test-fire a digest for a channel (validates wiring without waiting for a real 404)
channels.post("/teams/:teamId/channels/:id/test", async (c) => {
  const teamId = c.req.param("teamId");
  const role = await teamRole(c.env, teamId, c.get("userId"));
  if (!role) return c.json({ error: "not found" }, 404);
  const ch = await db
    .select({ id: alertChannels.id, type: alertChannels.type, config: alertChannels.config })
    .from(alertChannels)
    .where(and(eq(alertChannels.id, c.req.param("id")), eq(alertChannels.team_id, teamId)))
    .get();
  if (!ch) return c.json({ error: "not found" }, 404);
  const { sendToChannel } = await import("../../lib/notify");
  const { getMailer } = await import("../../lib/mailer");
  const digest = {
    title: "404less: test notification",
    text: "If you can read this, the channel is wired correctly.",
    html: "<b>404less test</b>: the channel is wired correctly.",
  };
  try {
    await sendToChannel(ch.type as ChannelType, JSON.parse(ch.config), digest, getMailer(c.env));
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: String(err instanceof Error ? err.message : err) }, 502);
  }
});
