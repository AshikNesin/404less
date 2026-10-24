// Landing = sign in (magic link).
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { Bell, Bot, MailCheck, Radar, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input, Label } from '../components/ui/input';
import { Alert } from '../components/ui/alert';
import { Brand } from '../components/app-shell';

export const Route = createFileRoute('/')({
  validateSearch: (s: Record<string, unknown>): { error?: string } => (typeof s.error === 'string' ? { error: s.error } : {}),
  beforeLoad: async () => {
    const res = await fetch('/api/me');
    if (res.ok) throw redirect({ to: '/app' });
  },
  component: LoginPage,
});

const FEATURES = [
  { Icon: Radar, title: 'Realtime 404 tracking', text: 'A one-line snippet reports every hit, with referrer, and shows visitors a “did you mean” card.' },
  { Icon: Bot, title: 'Scheduled crawler', text: 'Checks every link and asset, captures redirect chains, and auto-resolves links once they work again.' },
  { Icon: Bell, title: 'Digests, not noise', text: 'Slack, Pushover or email — one grouped digest per window, suggested fixes included.' },
  { Icon: Sparkles, title: 'MCP for your agent', text: 'Read-only tools so Claude Code or Cursor can list broken links and open the fix PR.' },
];

function LoginPage() {
  const { error } = Route.useSearch();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/auth/magic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (body.devLink) {
        // dev-mode link may carry the configured custom domain; use the origin we're actually on
        const u = new URL(body.devLink, location.origin);
        u.protocol = location.protocol; u.host = location.host;
        window.location.href = u.toString();
        return;
      }
      if (body.ok) setSent(true);
      else setMsg(body.error ?? 'Something went wrong');
    } catch {
      setMsg('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between bg-sidebar p-10 lg:flex">
        <Brand />
        <div className="max-w-md space-y-8">
          <div className="space-y-3">
            <h1 className="text-[2rem] leading-tight font-semibold tracking-tight">Broken links, found and fixed before your visitors give up.</h1>
            <p className="text-[0.9375rem] text-muted-foreground">Self-hostable on Cloudflare’s free tier. Realtime 404 tracking, a scheduled crawler, grouped alerts and suggested fixes in one calm dashboard.</p>
          </div>
          <ul className="space-y-4">
            {FEATURES.map(({ Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-foreground shadow-xs"><Icon className="size-4" /></span>
                <span><span className="block text-[0.875rem] font-medium">{title}</span><span className="block text-[0.8125rem] text-muted-foreground">{text}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-meta">Open source · MIT · <a className="hover:text-foreground" href="https://github.com/AshikNesin/404less" target="_blank" rel="noreferrer">github.com/AshikNesin/404less</a></p>
      </section>

      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden"><Brand /></div>
          <div>
            <h2 className="text-page-title">Sign in</h2>
            <p className="text-caption mt-1">We’ll email you a link. No password to remember.</p>
          </div>
          {error === 'expired' && <Alert tone="warning" title="That link has expired or was already used.">Request a new one below.</Alert>}
          {sent ? (
            <Alert tone="info" title="Check your inbox">
              <p>We sent a sign-in link to <span className="font-medium">{email}</span>. It expires in 15 minutes.</p>
              <Button variant="link" size="sm" className="mt-1" onClick={() => setSent(false)}><MailCheck /> Use a different email</Button>
            </Alert>
          ) : (
            <form onSubmit={send} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="h-9" />
              </div>
              <Button type="submit" pending={busy} size="lg" className="h-9 w-full">Send sign-in link</Button>
              {msg && <p className="text-[0.8125rem] text-destructive">{msg}</p>}
            </form>
          )}
          <p className="text-meta">First time here? Signing in creates your account and a personal team.</p>
        </div>
      </section>
    </div>
  );
}
