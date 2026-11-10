// Public waitlist form. JSON for the site script, a small HTML page for a
// no-JS submit. Same-origin only (see joinWaitlist).
import { Hono, type Context } from "hono";
import type { Env } from "../../types";
import { joinWaitlist, type WaitlistResult } from "./waitlist.service";

type WaitlistCtx = Context<{ Bindings: Env }>;

export const waitlist = new Hono<{ Bindings: Env }>();

waitlist.post("/", (c) => handle(c));
waitlist.post("", (c) => handle(c));

async function handle(c: WaitlistCtx): Promise<Response> {
  const type = c.req.header("content-type") ?? "";
  let email: unknown;
  let source: unknown;
  let company: unknown;
  if (type.includes("application/json")) {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    email = body.email;
    source = body.source;
    company = body.company;
  } else {
    const form = (await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>;
    email = form.email;
    source = form.source;
    company = form.company;
  }
  const result = await joinWaitlist({
    email,
    source,
    company,
    ip: (c.req.header("cf-connecting-ip") ?? "unknown").slice(0, 64),
    origin: c.req.header("origin"),
    host: new URL(c.req.url).host,
  });
  const accept = c.req.header("accept") ?? "";
  if (type.includes("application/json") || accept.includes("application/json")) {
    if (result.status === 200) return c.json({ ok: true });
    return c.json({ error: result.error }, result.status);
  }
  return c.html(page(result), result.status);
}

function page(result: WaitlistResult): string {
  const ok = result.status === 200;
  const title = ok ? "You’re on the list" : "Couldn’t add you";
  const message = ok
    ? "We’ll email you if a hosted version of 404less happens. Nothing else."
    : result.error;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} · 404less</title>
<link rel="stylesheet" href="/site.css">
</head>
<body>
<main class="nf"><div class="container">
<h1>${esc(title)}</h1>
<p class="lead">${esc(message)}</p>
<div class="ctas"><a class="btn btn-primary" href="/">Back home</a></div>
</div></main>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
