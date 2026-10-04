// Landing = login (magic link).
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { LinkIcon } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const res = await fetch('/api/teams');
    if (res.ok) window.location.href = '/app';
  },
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState('');
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
      if (body.devLink) { window.location.href = body.devLink; return; }
      setMsg(body.ok ? 'Check your inbox — the link expires in 15 minutes.' : (body.error ?? 'Something went wrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">
            404<span className="text-primary">less</span>
          </CardTitle>
          <CardDescription>
            Broken-link monitoring that self-hosts for free on Cloudflare.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={send} className="space-y-3">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <Button type="submit" pending={busy} className="w-full">
              <LinkIcon /> Send sign-in link
            </Button>
          </form>
          {msg && <p className="mt-3 text-sm text-muted-foreground">{msg}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
