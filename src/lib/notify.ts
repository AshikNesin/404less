// Notification adapters: Slack webhook, Pushover, email (Resend).
// All behind one interface so channels stay swappable (self-hosters can pick).
export type ChannelType = 'slack' | 'pushover' | 'email';
export type ChannelConfig = { url?: string; token?: string; user?: string; to?: string };

export type DigestGroup = {
  url: string;
  count: number;
  lastTs: number;
  topReferrer: string | null;
};

export function buildDigest(
  siteName: string,
  groups: DigestGroup[],
  windowMinutes: number,
): { title: string; text: string; html: string } {
  const totalHits = groups.reduce((n, g) => n + g.count, 0);
  const title = `404less: ${totalHits} broken-link hit${totalHits === 1 ? '' : 's'} on ${siteName} (last ${windowMinutes} min)`;
  const lines = groups.map((g) => {
    const ref = g.topReferrer ? ` ← ${g.topReferrer}` : '';
    return `${g.count}× ${g.url}${ref}`;
  });
  // the title travels separately (Slack's first line, Pushover's title, the email subject)
  const text = lines.join('\n');
  const items = groups
    .map((g) => {
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const ref = g.topReferrer ? ` <small style="color:#6b7280">← ${esc(g.topReferrer)}</small>` : '';
      return `<li style="margin:4px 0"><b>${g.count}×</b> <a href="${esc(g.url)}">${esc(g.url)}</a>${ref}</li>`;
    })
    .join('');
  const html = `<div style="font-family:system-ui,sans-serif;color:#1b1e27"><h3 style="margin:0 0 8px">${title}</h3><ul style="padding-left:18px;margin:8px 0">${items}</ul></div>`;
  return { title, text, html };
}

export async function sendToChannel(
  type: ChannelType,
  config: ChannelConfig,
  digest: { title: string; text: string; html: string },
  mailer: { send: (o: { to: string; subject: string; html: string; text?: string }) => Promise<void> } | null,
): Promise<void> {
  if (type === 'slack') {
    if (!config.url) throw new Error('slack channel missing webhook url');
    const res = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `${digest.title}\n${digest.text}`.slice(0, 3500) }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`slack webhook ${res.status}`);
    return;
  }
  if (type === 'pushover') {
    if (!config.token || !config.user) throw new Error('pushover channel missing token/user');
    const body = new URLSearchParams({
      token: config.token,
      user: config.user,
      title: digest.title.slice(0, 250),
      message: digest.text.slice(0, 1024),
    });
    const res = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`pushover ${res.status}`);
    return;
  }
  if (type === 'email') {
    if (!config.to) throw new Error('email channel missing to address');
    if (!mailer) throw new Error('email not configured (set RESEND_API_KEY)');
    await mailer.send({ to: config.to, subject: digest.title, html: digest.html, text: digest.text });
    return;
  }
  throw new Error(`unknown channel type ${type}`);
}

export function validateChannelConfig(type: ChannelType, config: unknown): ChannelConfig | null {
  if (!config || typeof config !== 'object') return null;
  const c = config as Record<string, unknown>;
  const str = (v: unknown, max = 300) => typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null;

  if (type === 'slack') {
    const url = str(c.url);
    if (!url) return null;
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    } catch {
      return null;
    }
    return { url };
  }
  if (type === 'pushover') {
    const token = str(c.token, 64), user = str(c.user, 64);
    if (!token || !user) return null;
    return { token, user };
  }
  if (type === 'email') {
    const to = str(c.to, 254);
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return null;
    return { to };
  }
  return null;
}
