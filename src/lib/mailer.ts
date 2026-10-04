// Outbound email adapters. Priority: Resend (if RESEND_API_KEY) → Cloudflare
// Email Service binding (if EMAIL binding present) → dev-log mode.
//
// MODES:
//  - Hosted SaaS (arbitrary recipients): set RESEND_API_KEY + MAIL_FROM.
//  - Self-hosted (you + teammates): keep the EMAIL binding; each recipient
//    verifies their address once in the CF dashboard (free, unlimited).
//  - Local dev / neither: log-only.
//
// Why the CF binding works on the free plan: sends to *verified destination
// addresses* (each user verifies their own address once in the CF dashboard)
// are free and unlimited. Perfect for self-hosted magic links + digests.
// For a hosted SaaS with arbitrary recipients, set RESEND_API_KEY instead.
import { EmailMessage } from 'cloudflare:email';
import type { Env } from '../types';

export type Mailer = {
  send: (opts: { to: string; subject: string; html: string; text?: string }) => Promise<void>;
  /** which adapter is active — surfaced in logs/tests */
  kind: 'resend' | 'cloudflare' | 'dev';
};

export function getMailer(env: Env): Mailer {
  if (env.DEV_MAILER === '1') return devMailer(); // tests / explicit opt-out
  if (env.RESEND_API_KEY) return resendMailer(env.RESEND_API_KEY, env.MAIL_FROM);
  if ((env as { EMAIL?: unknown }).EMAIL) return cloudflareMailer((env as { EMAIL: SendEmail }).EMAIL, env.MAIL_FROM);
  return devMailer();
}

function resendMailer(apiKey: string, from?: string): Mailer {
  const sender = from ?? '404less <onboarding@resend.dev>';
  return {
    kind: 'resend',
    async send({ to, subject, html, text }) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: sender, to, subject, html, text }),
      });
      if (!res.ok) throw new Error(`resend: ${res.status} ${await res.text()}`);
    },
  };
}

function cloudflareMailer(binding: SendEmail, from?: string): Mailer {
  // MAIL_FROM should be an address on a domain with Email Routing enabled.
  const sender = from ?? 'noreply@404less.invalid';
  // envelope sender must be the bare address; display name lives only in the header
  const envelopeFrom = extractAddress(sender);
  return {
    kind: 'cloudflare',
    async send({ to, subject, html, text }) {
      const raw = buildMime(sender, to, subject, html, text);
      const message = new EmailMessage(envelopeFrom, to, raw);
      await binding.send(message); // throws on failure; returns {messageId} on success
    },
  };
}

/** "Name <a@b.c>" -> "a@b.c" */
export function extractAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim();
}

function devMailer(): Mailer {
  return {
    kind: 'dev',
    async send({ to, subject }) {
      // no adapter configured: log so local dev / misconfigured deploys are visible
      console.log(`[404less:mailer:dev] to=${to} subject="${subject}" (not sent — set RESEND_API_KEY or the EMAIL binding)`);
    },
  };
}

/** Minimal multipart/alternative MIME message. */
export function buildMime(from: string, to: string, subject: string, html: string, text?: string): string {
  const boundary = `=_404less_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const domain = from.split('@')[1]?.replace(/[>\s].*$/, '') ?? '404less.invalid';
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${mimeEncode(subject)}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join('\r\n');
  const parts = [
    `--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text ?? stripHtml(html)}`,
    `--${boundary}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${html}`,
    `--${boundary}--`,
  ].join('\r\n');
  return `${headers}\r\n\r\n${parts}\r\n`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** RFC 2047 encode when the subject isn't plain ASCII. */
function mimeEncode(s: string): string {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?utf-8?B?${btoa(unescape(encodeURIComponent(s)))}?=`;
}
