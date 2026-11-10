// Per-IP limits for the public tools. Memory covers one isolate; the shared
// rate-limiter Durable Object is the limit that survives across isolates.
import type { Context } from "hono";
import type { AppBindings } from "../../types";

const WINDOW_MS = 3_600_000;
const memory = new Map<string, { count: number; resetAt: number }>();
let inflight = 0;

export const TOOL_LIMITS = {
  redirects: 60,
  chain: 20,
  soft404: 20,
  scan: 40,
} as const;

const BUSY = "This checker is busy. Try again in a moment.";
const LIMITED = "Too many checks from this network. Try again in an hour.";

export async function enforceToolLimit(
  c: Context<AppBindings>,
  bucket: string,
  max: number,
): Promise<Response | null> {
  const ip = clientAddress(c).slice(0, 80) || "unknown";
  const key = `${bucket}:${ip}`;
  if (overMemory(key, max)) return c.json({ error: LIMITED }, 429);
  const ns = c.env?.RATELIMIT;
  if (!ns) return null;
  try {
    const stub = ns.get(ns.idFromName("tools-public"));
    const verdict = await stub.fetch(
      `https://ratelimit/${encodeURIComponent(key)}/check?limit=${max}`,
      { method: "POST" },
    );
    if (verdict.status === 429) return c.json({ error: LIMITED }, 429);
  } catch {
    // the in-isolate counter already applied
  }
  return null;
}

export function tryAcquire(): boolean {
  if (inflight >= 3) return false;
  inflight += 1;
  return true;
}

export function release(): void {
  inflight = Math.max(0, inflight - 1);
}

export function busy(): { error: string } {
  return { error: BUSY };
}

/** Same headers as core's clientIp: Cloudflare, then the first forwarded address. */
function clientAddress(c: Context<AppBindings>): string {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    "unknown"
  );
}

function overMemory(key: string, max: number): boolean {
  const now = Date.now();
  if (memory.size > 500) {
    for (const [stored, bucket] of memory) if (bucket.resetAt <= now) memory.delete(stored);
  }
  let bucket = memory.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    memory.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count > max;
}
