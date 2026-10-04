// Landing = login (magic link) or redirect into the app.
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const res = await fetch('/api/teams');
    if (res.ok) throw redirect({ to: '/app' });
  },
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/auth/magic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (body.devLink) {
        window.location.href = body.devLink;
        return;
      }
      if (body.ok) setMsg('Check your inbox — the link expires in 15 minutes.');
      else setMsg(body.error ?? 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">
          404<span className="text-blue-600">less</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">Broken-link monitoring that self-hosts for free.</p>
        <form onSubmit={send} className="mt-6 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <button
            disabled={busy}
            className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send sign-in link'}
          </button>
        </form>
        {msg && <p className="mt-3 text-sm text-slate-600">{msg}</p>}
      </div>
    </div>
  );
}
