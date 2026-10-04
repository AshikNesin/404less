// Outbound email: Resend only, behind one interface so it stays swappable.
// Without RESEND_API_KEY the app runs in dev mode: magic links are returned
// in the API response (devLink) instead of being emailed.
import type { Env } from '../types';

export type Mailer = {
  send: (opts: { to: string; subject: string; html: string; text?: string }) => Promise<void>;
};

export function getMailer(env: Env): Mailer | null {
  if (!env.RESEND_API_KEY) return null;
  const from = env.MAIL_FROM ?? '404less <onboarding@resend.dev>';
  return {
    async send({ to, subject, html, text }) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html, text }),
      });
      if (!res.ok) throw new Error(`resend: ${res.status} ${await res.text()}`);
    },
  };
}
