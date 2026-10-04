// Outbound email via the Resend HTTP API — the single adapter boundary for email.
// Self-hosters set RESEND_API_KEY (and optionally MAIL_FROM); without it,
// magic-link emails are logged instead (dev mode).
export type Mailer = {
  send: (opts: { to: string; subject: string; html: string; text?: string }) => Promise<void>;
};

export function getMailer(env: { RESEND_API_KEY?: string; MAIL_FROM?: string }): Mailer | null {
  if (!env.RESEND_API_KEY) return null;
  const from = env.MAIL_FROM ?? '404less <onboarding@resend.dev>';
  return {
    async send({ to, subject, html, text }) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to, subject, html, text }),
      });
      if (!res.ok) {
        console.error('resend error', res.status, await res.text());
      }
    },
  };
}
