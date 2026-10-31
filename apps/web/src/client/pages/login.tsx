// Sign in (magic link). Lives at /app/login outside the authenticated layout.
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { parseAsString, useQueryState } from "nuqs";
import { useAuthStore } from "@groot/shell/store/auth";
import { ArrowLeft, MailCheck } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input, Label } from "../components/ui/input";
import { Alert } from "../components/ui/alert";
import { Brand } from "../components/app-shell";

export function LoginPage() {
  const [error] = useQueryState("error", parseAsString);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/v1/auth/magic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (body.devLink) {
        // dev-mode link may carry the configured custom domain; use the origin we're actually on
        const u = new URL(body.devLink, location.origin);
        u.protocol = location.protocol;
        u.host = location.host;
        window.location.href = u.toString();
        return;
      }
      if (body.ok) setSent(true);
      else setMsg(body.error ?? "Something went wrong");
    } catch {
      setMsg("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // already signed in: straight to the app
  if (isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center justify-between px-5 md:px-8">
        <a href="/">
          <Brand />
        </a>
        <a href="/" className="link inline-flex items-center gap-1 text-[0.8125rem]">
          <ArrowLeft className="size-3.5" /> Back to 404less.com
        </a>
      </header>
      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <h1 className="text-page-title">Sign in</h1>
            <p className="text-caption mt-1">We’ll email you a link. No password to remember.</p>
          </div>
          {error === "expired" && (
            <Alert tone="warning" title="That link has expired or was already used.">
              Request a new one below.
            </Alert>
          )}
          {sent ? (
            <Alert tone="info" title="Check your inbox">
              <p>
                We sent a sign-in link to <span className="font-medium">{email}</span>. It expires
                in 15 minutes.
              </p>
              <Button variant="link" size="sm" className="mt-1" onClick={() => setSent(false)}>
                <MailCheck /> Use a different email
              </Button>
            </Alert>
          ) : (
            <form onSubmit={send} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-9"
                />
              </div>
              <Button type="submit" pending={busy} size="lg" className="h-9 w-full">
                Send sign-in link
              </Button>
              {msg && <p className="text-[0.8125rem] text-destructive">{msg}</p>}
            </form>
          )}
          <p className="text-meta">
            First time here? Signing in creates your account and a personal team.
          </p>
        </div>
      </main>
    </div>
  );
}
