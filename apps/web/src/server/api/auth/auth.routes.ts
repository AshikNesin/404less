// Auth: magic-link request + verification, session cookie, logout.
import { Hono } from "hono";
import { getMailer } from "../../lib/mailer";
import { getCookie } from "hono/cookie";
import { newId, now, SESSION_COOKIE, signSession, verifySession } from "../../lib/auth";
import type { Env } from "../../types";
import { eq, lt } from "drizzle-orm";
import { batch, db, magicTokens, teamMembers, teams, users } from "../../db";

export const auth = new Hono<{ Bindings: Env }>();

auth.post("/magic", async (c) => {
  const { email } = await c.req.json().catch(() => ({ email: null }));
  if (
    !email ||
    typeof email !== "string" ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
    email.length > 254
  ) {
    return c.json({ error: "invalid email" }, 400);
  }
  const normalized = email.toLowerCase();

  // Upsert user
  await db
    .insert(users)
    .values({ id: newId(), email: normalized, created_at: now() })
    .onConflictDoNothing({ target: users.email });
  const user = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized))
    .get();

  // Create magic token (15 min TTL)
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  await db
    .insert(magicTokens)
    .values({ token, user_id: user!.id, expires_at: now() + 15 * 60 * 1000 });

  const link = `${new URL(c.req.url).origin}/api/v1/auth/verify?token=${token}`;

  const mailer = getMailer(c.env);
  if (mailer) {
    await mailer.send({
      to: normalized,
      subject: "Your 404less sign-in link",
      html: `<div style="font-family:system-ui,sans-serif;color:#1b1e27;max-width:480px">
        <p style="font-size:15px">Click the button to sign in to 404less. The link expires in 15 minutes.</p>
        <p><a href="${link}" style="display:inline-block;background:#1f1f23;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Sign in to 404less</a></p>
        <p style="font-size:12px;color:#6b7280">Or paste this link into your browser:<br>${link}</p>
        <p style="font-size:12px;color:#6b7280">If you didn’t request this, you can ignore this email.</p></div>`,
      text: `Sign in to 404less: ${link}\nThe link expires in 15 minutes.`,
    });
    return c.json({ ok: true, emailed: true });
  }
  // Dev mode (no RESEND_API_KEY): return the link so you can test locally.
  console.log("[404less] magic link for", normalized, ":", link);
  return c.json({ ok: true, emailed: false, devLink: link });
});

auth.get("/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "missing token" }, 400);
  const row = await db
    .select({ user_id: magicTokens.user_id, expires_at: magicTokens.expires_at })
    .from(magicTokens)
    .where(eq(magicTokens.token, token))
    .get();
  if (!row || row.expires_at < now()) return c.redirect("/app/login?error=expired");

  await batch([
    db.delete(magicTokens).where(eq(magicTokens.token, token)),
    db.delete(magicTokens).where(lt(magicTokens.expires_at, now())),
  ]);
  await ensureTeam(c.env, row.user_id);

  const cookie = await signSession(row.user_id);
  c.header(
    "Set-Cookie",
    `${SESSION_COOKIE}=${cookie}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
  );
  return c.redirect("/app");
});

/**
 * The signed-in user in groot's response envelope: what @groot/shell's session
 * store (`checkAuth`, ProtectedRoute) reads. 401 without a valid session.
 */
auth.get("/me", async (c) => {
  const userId = await verifySession(getCookie(c, SESSION_COOKIE));
  const user = userId
    ? await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .get()
    : undefined;
  if (!user)
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Not signed in" } },
      401,
    );
  return c.json({ success: true, data: { id: user.id, email: user.email, name: null } });
});

auth.post("/logout", async (c) => {
  c.header("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  return c.json({ ok: true });
});

/** Every user gets a personal team on first sign-in, so "add a site" never needs a team step. */
async function ensureTeam(env: Env, userId: string): Promise<void> {
  const member = await db
    .select({ ok: teamMembers.user_id })
    .from(teamMembers)
    .where(eq(teamMembers.user_id, userId))
    .limit(1)
    .get();
  if (member) return;
  const teamId = newId();
  await batch([
    db
      .insert(teams)
      .values({ id: teamId, name: "Personal", owner_user_id: userId, created_at: now() }),
    db.insert(teamMembers).values({ team_id: teamId, user_id: userId, role: "owner" }),
  ]);
}
