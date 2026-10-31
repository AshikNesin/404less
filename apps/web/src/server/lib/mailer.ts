// Outbound email: Resend only, behind one interface so it stays swappable.
// Without RESEND_API_KEY there is no mailer: on a loopback host the sign-in
// link is returned in the API response (devLink); elsewhere sign-in answers 503.
import type { Env } from "../types";

export type Mailer = {
  send: (opts: { to: string; subject: string; html: string; text?: string }) => Promise<void>;
};

export function getMailer(env: Env): Mailer | null {
  if (!env.RESEND_API_KEY) return null;
  // MAIL_FROM wins; without a verified custom domain we can still *try* the
  // product's own address: Resend rejects unverified sender domains at send
  // time, which the caller surfaces. Sandbox fallback only in dev mode.
  const from = env.MAIL_FROM ?? "404less <no-reply@dev.404less.com>";
  return {
    async send({ to, subject, html, text }) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to, subject, html, text }),
      });
      if (!res.ok) throw new Error(`resend: ${res.status} ${await res.text()}`);
    },
  };
}
